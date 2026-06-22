export interface Ros2Package {
    name: string;
    path: string;
    relativePath: string;
    group: string;
    buildType: 'ament_cmake' | 'ament_python';
    dependencies: string[];
    description: string;
    mtime: number;
}

export interface BuildResult {
    success: boolean;
    packages: Map<string, PackageBuildResult>;
    totalErrors: number;
    totalWarnings: number;
    duration: number;
    timestamp: number;
}

export interface PackageBuildResult {
    name: string;
    status: 'success' | 'failed' | 'skipped';
    errors: BuildDiagnostic[];
    warnings: BuildDiagnostic[];
    duration: number;
}

export interface BuildDiagnostic {
    file: string;
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
}

export interface BuildOptions {
    packages: Ros2Package[];
    buildType: string;
    parallelWorkers: number;
    symlinkInstall: boolean;
    continueOnError: boolean;
    extraArgs: string[];
}

export interface DockerBuildOptions extends BuildOptions {
    builderName: string;
    platform: string;
}
