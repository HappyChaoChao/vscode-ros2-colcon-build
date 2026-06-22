import { BuildDiagnostic, PackageBuildResult } from '../types';
import { EventEmitter } from 'events';

export interface BuildEvent {
    type: 'packageStart' | 'packageSuccess' | 'packageFailure' | 'error' | 'warning' | 'complete';
    packageName?: string;
    diagnostic?: BuildDiagnostic;
    timestamp: number;
}

export class OutputParser extends EventEmitter {
    private currentPackage: string | null = null;
    private packageResults: Map<string, PackageBuildResult> = new Map();
    private startTime: number = 0;
    private totalPackages: number = 0;
    private completedPackages: number = 0;

    // Regex patterns for colcon output
    private patterns = {
        packageStart: /Starting >>> (\w+)/,
        packageSuccess: /Finished <<< (\w+) \[(\S+)\]/,
        packageFailure: /Failed\s+<<< (\w+) \[(\S+)\]/,
        compilerError: /([\w/.]+\.(?:cpp|hpp|h|cc|cxx|py)):(\d+):(\d+):\s*(?:error|fatal error):\s*(.+)/,
        compilerWarning: /([\w/.]+\.(?:cpp|hpp|h|cc|cxx|py)):(\d+):\d+:\s*warning:\s*(.+)/,
        cmakeError: /CMake Error at (\S+):(\d+)/,
        linkerError: /undefined reference to `(.+)'/
    };

    reset(): void {
        this.currentPackage = null;
        this.packageResults.clear();
        this.startTime = Date.now();
        this.completedPackages = 0;
    }

    setTotalPackages(total: number): void {
        this.totalPackages = total;
    }

    getProgress(): { current: number; total: number; packageName: string | null } {
        return {
            current: this.completedPackages,
            total: this.totalPackages,
            packageName: this.currentPackage
        };
    }

    parseLine(line: string): void {
        // Check for package start
        const startMatch = this.patterns.packageStart.exec(line);
        if (startMatch) {
            this.currentPackage = startMatch[1];
            this.packageResults.set(this.currentPackage, {
                name: this.currentPackage,
                status: 'success',
                errors: [],
                warnings: [],
                duration: 0
            });
            this.emit('event', {
                type: 'packageStart',
                packageName: this.currentPackage,
                timestamp: Date.now()
            } as BuildEvent);
            return;
        }

        // Check for package success
        const successMatch = this.patterns.packageSuccess.exec(line);
        if (successMatch) {
            const pkgName = successMatch[1];
            const result = this.packageResults.get(pkgName);
            if (result) {
                result.status = 'success';
                result.duration = Date.now() - this.startTime;
            }
            this.completedPackages++;
            this.emit('event', {
                type: 'packageSuccess',
                packageName: pkgName,
                timestamp: Date.now()
            } as BuildEvent);
            return;
        }

        // Check for package failure
        const failureMatch = this.patterns.packageFailure.exec(line);
        if (failureMatch) {
            const pkgName = failureMatch[1];
            const result = this.packageResults.get(pkgName);
            if (result) {
                result.status = 'failed';
                result.duration = Date.now() - this.startTime;
            }
            this.emit('event', {
                type: 'packageFailure',
                packageName: pkgName,
                timestamp: Date.now()
            } as BuildEvent);
            return;
        }

        // Check for compiler errors
        const errorMatch = this.patterns.compilerError.exec(line);
        if (errorMatch) {
            const diagnostic: BuildDiagnostic = {
                file: errorMatch[1],
                line: parseInt(errorMatch[2]),
                column: parseInt(errorMatch[3]),
                message: errorMatch[4],
                severity: 'error'
            };
            this.addDiagnostic(diagnostic);
            this.emit('event', {
                type: 'error',
                diagnostic,
                timestamp: Date.now()
            } as BuildEvent);
            return;
        }

        // Check for compiler warnings
        const warningMatch = this.patterns.compilerWarning.exec(line);
        if (warningMatch) {
            const diagnostic: BuildDiagnostic = {
                file: warningMatch[1],
                line: parseInt(warningMatch[2]),
                column: 0,
                message: warningMatch[3],
                severity: 'warning'
            };
            this.addDiagnostic(diagnostic);
            this.emit('event', {
                type: 'warning',
                diagnostic,
                timestamp: Date.now()
            } as BuildEvent);
            return;
        }

        // Check for cmake errors
        const cmakeMatch = this.patterns.cmakeError.exec(line);
        if (cmakeMatch) {
            const diagnostic: BuildDiagnostic = {
                file: cmakeMatch[1],
                line: parseInt(cmakeMatch[2]),
                column: 0,
                message: line,
                severity: 'error'
            };
            this.addDiagnostic(diagnostic);
            this.emit('event', {
                type: 'error',
                diagnostic,
                timestamp: Date.now()
            } as BuildEvent);
            return;
        }
    }

    private addDiagnostic(diagnostic: BuildDiagnostic): void {
        if (this.currentPackage) {
            const result = this.packageResults.get(this.currentPackage);
            if (result) {
                if (diagnostic.severity === 'error') {
                    result.errors.push(diagnostic);
                } else {
                    result.warnings.push(diagnostic);
                }
            }
        }
    }

    getResults(): Map<string, PackageBuildResult> {
        return this.packageResults;
    }

    getTotalErrors(): number {
        let total = 0;
        for (const result of this.packageResults.values()) {
            total += result.errors.length;
        }
        return total;
    }

    getTotalWarnings(): number {
        let total = 0;
        for (const result of this.packageResults.values()) {
            total += result.warnings.length;
        }
        return total;
    }
}
