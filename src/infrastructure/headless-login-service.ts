import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { authenticator } from 'otplib';
import { createLogger } from './logger';

const log = createLogger('HeadlessLogin');

export interface LoginCredentials {
  username: string;
  password: string;
  totpSecret?: string;
  /** If true, enables paper trading mode (no 2FA required) */
  paperTrading?: boolean;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  requiresManualIntervention?: boolean;
}

export interface HeadlessLoginOptions {
  headless?: boolean;
  timeout?: number;
}

/**
 * Automates IBKR Gateway web login using Playwright.
 *
 * Login flow:
 * 1. Navigate to gateway login page
 * 2. Enter username and password
 * 3. Submit credentials
 * 4. Enter TOTP code (if configured)
 * 5. Wait for successful redirect
 */
export class HeadlessLoginService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(
    private readonly gatewayUrl: string,
    private readonly options: HeadlessLoginOptions = {}
  ) {}

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const timeout = this.options.timeout ?? 60000;
    let page: Page | null = null;

    try {
      await this.initBrowser();
      page = await this.context!.newPage();

      // Step 1: Navigate to login page
      const loginUrl = `${this.gatewayUrl}/sso/Login`;
      log.info('Navigating to gateway login');
      await page.goto(loginUrl, { waitUntil: 'networkidle', timeout });

      // Step 2: Wait for and fill login form
      log.debug('Waiting for login form');
      await this.waitForLoginForm(page, timeout);

      log.debug('Entering credentials');
      await this.enterCredentials(page, credentials);

      // Step 3: Submit credentials
      log.debug('Submitting login form');
      await this.submitForm(page);

      // Step 4: Handle post-login (TOTP or success)
      log.debug('Waiting for login result');
      return await this.handlePostLogin(page, credentials, timeout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Login failed: ${message}`);
      return { success: false, error: message };
    } finally {
      await this.cleanup();
    }
  }

  private async waitForLoginForm(page: Page, timeout: number): Promise<void> {
    await page.waitForSelector('input[name="username"], input#user_name, input[name="user_name"]', {
      timeout,
      state: 'visible',
    });
  }

  private async enterCredentials(page: Page, credentials: LoginCredentials): Promise<void> {
    // Enable paper trading mode if requested
    if (credentials.paperTrading) {
      log.debug('Enabling paper trading mode');
      // The paper trading toggle uses a hidden checkbox with a visible label
      // We need to click the label (for="toggle1") to toggle the checkbox
      const paperSwitch = await page.$('input[name="paperSwitch"], input#toggle1');
      if (paperSwitch) {
        const isChecked = await paperSwitch.isChecked();
        if (!isChecked) {
          // Click the label instead of the hidden checkbox
          const label = await page.$('label[for="toggle1"]');
          if (label) {
            await label.click();
          } else {
            // Fallback: use JavaScript to check the checkbox
            await page.evaluate(`
              (() => {
                const checkbox = document.querySelector('input[name="paperSwitch"]');
                if (checkbox) {
                  checkbox.checked = true;
                  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
              })()
            `);
          }
          await page.waitForTimeout(300);
          log.debug('Paper trading toggle enabled');
        }
      } else {
        log.warn('Paper trading toggle not found on login page');
      }
    }

    log.debug(`Entering username (length=${credentials.username.length})`);
    
    // Fill username using page.fill which is more reliable
    await page.fill('input[name="username"]', credentials.username);

    // Fill password
    await page.fill('input[name="password"], input[type="password"]', credentials.password);
    log.debug('Filled password');
    
    // Small delay to let any JS handlers process
    await page.waitForTimeout(500);
  }

  private async submitForm(page: Page): Promise<void> {
    log.debug('Submitting form via Enter key');
    
    // Focus on password field and press Enter - most reliable method
    await page.focus('input[name="password"], input[type="password"]');
    await page.keyboard.press('Enter');

    // Wait for the page to process the submission
    await page.waitForTimeout(5000);
    await this.waitForLoadingComplete(page);
  }

  private async waitForLoadingComplete(page: Page): Promise<void> {
    // Wait for any loading indicators to disappear
    try {
      const loader = await page.$('.xyzblock-loading, [class*="loading"], [class*="spinner"]');
      if (loader && await loader.isVisible()) {
        await page.waitForSelector('.xyzblock-loading, [class*="loading"], [class*="spinner"]', { 
          state: 'hidden', 
          timeout: 30000 
        });
      }
    } catch {
      // Loading indicator gone or never appeared
    }
  }

  private async handlePostLogin(page: Page, credentials: LoginCredentials, timeout: number): Promise<LoginResult> {
    const startTime = Date.now();
    let lastDebugTime = 0;

    while (Date.now() - startTime < timeout) {
      try {
        // Check for successful redirect (no longer on SSO page)
        const currentUrl = page.url();
        if (!currentUrl.includes('/sso/')) {
          log.info('Login successful - redirected from SSO');
          return { success: true };
        }

        const pageContent = await page.content();

        // Check for explicit success message
        if (pageContent.includes('Client login succeeds') || pageContent.includes('login succeeds')) {
          log.info('Login successful');
          return { success: true };
        }

        // Check for TOTP input field
        const totpResult = await this.checkAndHandleTotp(page, credentials);
        if (totpResult) {
          return totpResult;
        }

        // Debug: log page state every 10 seconds
        const now = Date.now();
        if (now - lastDebugTime > 10000) {
          lastDebugTime = now;
          const pageState = await page.evaluate(`
            (() => {
              const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
                type: i.type,
                name: i.name,
                visible: i.offsetParent !== null
              }));
              return {
                url: window.location.href,
                inputCount: inputs.length,
                visibleInputs: inputs.filter(i => i.visible),
                bodySnippet: document.body.innerText.substring(0, 200)
              };
            })()
          `) as any;
          log.debug(`Page state: ${JSON.stringify(pageState)}`);
        }

        await page.waitForTimeout(500);
      } catch (error) {
        // Page may have closed/navigated during successful login
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('closed') || message.includes('Target page')) {
          log.info('Login successful (page closed)');
          return { success: true };
        }
        throw error;
      }
    }

    return { success: false, error: 'Login timeout - no TOTP field found or redirect' };
  }

  private async checkAndHandleTotp(page: Page, credentials: LoginCredentials): Promise<LoginResult | null> {
    // Look for TOTP input using JavaScript evaluation for more reliable detection
    const totpFieldInfo = await page.evaluate(`
      (() => {
        // Find all visible text/tel inputs
        const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input:not([type])');
        for (const input of inputs) {
          // Skip username/password fields
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          if (name.includes('user') || name.includes('password') || id.includes('user') || id.includes('password')) {
            continue;
          }
          // Check if visible
          if (input.offsetParent !== null) {
            const placeholder = input.placeholder || '';
            const ariaLabel = input.getAttribute('aria-label') || '';
            return {
              found: true,
              placeholder,
              ariaLabel,
              name: input.name,
              id: input.id,
              type: input.type
            };
          }
        }
        return { found: false };
      })()
    `) as { found: boolean; placeholder?: string; name?: string; id?: string; type?: string };

    if (totpFieldInfo.found && totpFieldInfo.name) {
      log.debug(`TOTP input detected: name=${totpFieldInfo.name}, placeholder=${totpFieldInfo.placeholder}`);
      
      // Use the specific field name we found
      const field = await page.$(`input[name="${totpFieldInfo.name}"]`);
      if (field && await field.isVisible()) {
        return await this.enterTotp(page, field, credentials);
      }
    }

    return null;
  }

  private async enterTotp(page: Page, totpField: ReturnType<Page['$']> extends Promise<infer T> ? T : never, credentials: LoginCredentials): Promise<LoginResult> {
    if (!credentials.totpSecret) {
      return { 
        success: false, 
        error: 'TOTP required but no secret configured', 
        requiresManualIntervention: true 
      };
    }

    // Generate and enter TOTP code
    const totpCode = authenticator.generate(credentials.totpSecret);
    log.debug(`Entering TOTP code: ${totpCode}`);
    
    await totpField!.fill(totpCode);
    await page.waitForTimeout(1000);

    // Submit by pressing Enter (this worked in earlier tests)
    log.debug('Submitting TOTP');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    // Wait for result
    const resultTimeout = 15000;
    const startTime = Date.now();

    while (Date.now() - startTime < resultTimeout) {
      try {
        // Check for redirect (success)
        const currentUrl = page.url();
        if (!currentUrl.includes('/sso/')) {
          log.info('Login successful after TOTP - redirected');
          return { success: true };
        }

        const content = await page.content();
        
        if (content.includes('Client login succeeds') || content.includes('login succeeds')) {
          log.info('Login successful');
          return { success: true };
        }

        // Only check for actual TOTP error elements, not just any text containing "invalid"
        const hasError = await page.evaluate(`
          (() => {
            const alerts = document.querySelectorAll('.alert-danger, .error, [role="alert"]');
            for (const alert of alerts) {
              if (alert.offsetParent !== null && alert.textContent) {
                const text = alert.textContent.toLowerCase();
                if (text.includes('invalid') || text.includes('incorrect') || text.includes('expired')) {
                  return alert.textContent.trim();
                }
              }
            }
            return null;
          })()
        `) as string | null;

        if (hasError) {
          log.error(`TOTP error: ${hasError}`);
          return { success: false, error: 'TOTP verification failed' };
        }

        await page.waitForTimeout(500);
      } catch (error) {
        // Page may have navigated - likely success
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('closed') || message.includes('Target page')) {
          log.info('Login successful (page closed after TOTP)');
          return { success: true };
        }
        throw error;
      }
    }

    return { success: false, error: 'TOTP verification timeout' };
  }

  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      const headless = this.options.headless ?? true;
      this.browser = await chromium.launch({
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.context = await this.browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1280, height: 720 },
      });
    }
  }

  private async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
