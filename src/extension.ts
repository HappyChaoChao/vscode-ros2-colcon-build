import * as vscode from 'vscode';
import * as path from 'path';
import { PackageScanner } from './scanner/packageScanner';
import { ColconBuilder } from './builder/colconBuilder';
import { OutputParser } from './builder/outputParser';
import { OutputChannelManager } from './ui/outputChannel';
import { DiagnosticsManager } from './ui/diagnostics';
import { StatusBarItem } from './ui/statusBarItem';
import { SidebarProvider } from './ui/sidebar/sidebarProvider';
import { Settings } from './config/settings';
import { Logger, LogLevel } from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
    // Initialize logger
    const logger = Logger.getInstance();
    const logPath = path.join(context.logUri.fsPath, 'ros2-build.log');
    logger.setLogFile(logPath);
    logger.setMinLevel(LogLevel.DEBUG);
    logger.info('ROS2 Colcon Build extension is now active');
    logger.info(`Log file: ${logPath}`);

    try {
        // Initialize managers
        const outputChannel = new OutputChannelManager();
        const diagnostics = new DiagnosticsManager();
        const settings = new Settings();
        const scanner = new PackageScanner();
        const outputParser = new OutputParser();
        const builder = new ColconBuilder(outputChannel, outputParser, settings);
        const statusBarItem = new StatusBarItem();

        logger.info('All managers initialized successfully');

    // Register sidebar provider
    const sidebarProvider = new SidebarProvider(
        context.extensionUri,
        scanner,
        builder,
        settings,
        outputChannel,
        diagnostics,
        statusBarItem,
        context
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ros2.buildSidebar', sidebarProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.buildSelected', async () => {
            const packages = sidebarProvider.getSelectedPackages();
            if (packages.length === 0) {
                vscode.window.showWarningMessage('No packages selected');
                return;
            }
            await builder.build(packages);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.buildCurrent', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            const packageInfo = await scanner.findPackageByFilePath(editor.document.uri.fsPath);
            if (!packageInfo) {
                vscode.window.showWarningMessage('Could not determine package for current file');
                return;
            }
            await builder.build([packageInfo]);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.buildAll', async () => {
            await sidebarProvider.buildAllPackages();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.buildWithDeps', async () => {
            const packages = sidebarProvider.getSelectedPackages();
            if (packages.length === 0) {
                vscode.window.showWarningMessage('No packages selected');
                return;
            }
            const withDeps = await scanner.getPackagesWithDependencies(packages);
            await builder.build(withDeps);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.clean', async () => {
            await builder.clean();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.cleanRebuild', async () => {
            await builder.clean();
            const packages = await scanner.scanAllPackages();
            await builder.build(packages);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.buildDocker', async () => {
            const packages = sidebarProvider.getSelectedPackages();
            if (packages.length === 0) {
                vscode.window.showWarningMessage('No packages selected');
                return;
            }
            await builder.buildDocker(packages);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ros2.scanPackages', async () => {
            await scanner.scanAllPackages();
            sidebarProvider.refresh();
            vscode.window.showInformationMessage('Package scan complete');
        })
    );

    // Initial scan
    scanner.scanAllPackages().then(() => {
        sidebarProvider.refresh();
    });

    // Watch for package.xml changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/package.xml');
    watcher.onDidChange(() => scanner.scanAllPackages().then(() => sidebarProvider.refresh()));
    watcher.onDidCreate(() => scanner.scanAllPackages().then(() => sidebarProvider.refresh()));
    watcher.onDidDelete(() => scanner.scanAllPackages().then(() => sidebarProvider.refresh()));
    context.subscriptions.push(watcher);

    } catch (error) {
        logger.error('ROS2 Colcon Build extension failed to activate', error as Error);
        vscode.window.showErrorMessage(`ROS2 Colcon Build extension failed to activate: ${error}`);
    }
}

export function deactivate() {
    // Cleanup if needed
}
