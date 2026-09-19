/**
 * RadNode Persistent Error Logger Service
 * Intercepts all runtime errors, unhandled rejections, console.error calls,
 * and records them directly to the persistent on-disk log file (via Electron IPC)
 * as well as an in-memory buffer.
 */

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private memoryLogs: LogEntry[] = [];
  private maxMemoryLogs = 200;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  /**
   * Initializes global error listeners and intercepts console.error
   */
  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Global Window Error Listener
    window.addEventListener('error', (event) => {
      this.error(
        `Uncaught Error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
        event.error,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      );
      // Prevent browser default dialog / crash handling
      event.preventDefault();
    });

    // 2. Global Unhandled Promise Rejection Listener
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.error(
        `Unhandled Promise Rejection: ${reason?.message || String(reason)}`,
        reason instanceof Error ? reason : undefined,
        { reason }
      );
      event.preventDefault();
    });

    // 3. Intercept console.error to log third-party and framework errors
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      try {
        const firstArg = args[0];
        const message = typeof firstArg === 'string' ? firstArg : (firstArg?.message || JSON.stringify(firstArg));
        let errorObj: Error | undefined;
        let contextObj: any = undefined;

        for (const arg of args) {
          if (arg instanceof Error) {
            errorObj = arg;
          } else if (typeof arg === 'object' && arg !== null) {
            contextObj = { ...contextObj, ...arg };
          }
        }

        this.record({
          level: 'error',
          message: `[console.error] ${message}`,
          stack: errorObj?.stack,
          context: contextObj
        });
      } catch (_) {}
    };

    this.info('RadNode Logger Service initialized successfully.');
  }

  public record(data: Omit<LogEntry, 'timestamp'>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: data.level,
      message: data.message,
      stack: data.stack,
      context: {
        ...data.context,
        memory: (performance as any)?.memory
          ? {
              usedJSHeap: Math.round(((performance as any).memory.usedJSHeapSize || 0) / 1048576) + ' MB',
              totalJSHeap: Math.round(((performance as any).memory.totalJSHeapSize || 0) / 1048576) + ' MB'
            }
          : undefined,
        viewportSize: `${window.innerWidth}x${window.innerHeight}`
      }
    };

    // Store in-memory
    this.memoryLogs.push(entry);
    if (this.memoryLogs.length > this.maxMemoryLogs) {
      this.memoryLogs.shift();
    }

    // Forward to Native Electron Persistent File
    if (window.electronAPI?.logError) {
      window.electronAPI.logError({
        level: entry.level,
        message: entry.message,
        stack: entry.stack,
        context: entry.context
      }).catch(() => {});
    }
  }

  public error(message: string, error?: Error, context?: Record<string, any>) {
    this.record({
      level: 'error',
      message,
      stack: error?.stack,
      context
    });
  }

  public warn(message: string, context?: Record<string, any>) {
    this.record({
      level: 'warn',
      message,
      context
    });
  }

  public info(message: string, context?: Record<string, any>) {
    this.record({
      level: 'info',
      message,
      context
    });
  }

  public getMemoryLogs(): LogEntry[] {
    return [...this.memoryLogs];
  }

  public async openLogFile(): Promise<boolean> {
    if (window.electronAPI?.openLogFile) {
      const res = await window.electronAPI.openLogFile();
      return res.success;
    }
    return false;
  }

  public async getLogPath(): Promise<string> {
    if (window.electronAPI?.getLogPath) {
      return await window.electronAPI.getLogPath();
    }
    return 'In-Memory Web Log Buffer';
  }

  public async readLogContent(): Promise<string> {
    if (window.electronAPI?.readLogContent) {
      return await window.electronAPI.readLogContent();
    }
    return this.memoryLogs
      .map(e => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}${e.stack ? '\n' + e.stack : ''}`)
      .join('\n\n');
  }

  public async clearLog(): Promise<boolean> {
    this.memoryLogs = [];
    if (window.electronAPI?.clearLog) {
      return await window.electronAPI.clearLog();
    }
    return true;
  }
}

export const logger = ErrorLogger.getInstance();
