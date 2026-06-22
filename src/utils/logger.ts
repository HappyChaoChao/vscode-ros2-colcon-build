import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logFile: string | null = null;
    private minLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('ROS2 Build Log');
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    setLogFile(filePath: string): void {
        this.logFile = filePath;
        // 确保日志目录存在
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    setMinLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    error(message: string, error?: Error, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args);
        if (error) {
            this.log(LogLevel.ERROR, `  Stack: ${error.stack}`);
        }
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (level < this.minLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level];
        const formattedMessage = `[${timestamp}] [${levelStr}] ${message}`;

        // 输出到 OutputChannel
        this.outputChannel.appendLine(formattedMessage);
        if (args.length > 0) {
            this.outputChannel.appendLine(`  Args: ${JSON.stringify(args)}`);
        }

        // 输出到日志文件
        if (this.logFile) {
            try {
                const logEntry = formattedMessage + (args.length > 0 ? ` ${JSON.stringify(args)}` : '') + '\n';
                fs.appendFileSync(this.logFile, logEntry);
            } catch (e) {
                // 忽略文件写入错误
            }
        }

        // 输出到控制台（开发模式）
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(formattedMessage, ...args);
                break;
            case LogLevel.INFO:
                console.info(formattedMessage, ...args);
                break;
            case LogLevel.WARN:
                console.warn(formattedMessage, ...args);
                break;
            case LogLevel.ERROR:
                console.error(formattedMessage, ...args);
                break;
        }
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
