import * as vscode from 'vscode';
import * as os from 'os';
import { Ros2Package } from '../../types';
import { PackageScanner } from '../../scanner/packageScanner';
import { ColconBuilder } from '../../builder/colconBuilder';
import { Settings } from '../../config/settings';
import { OutputChannelManager } from '../outputChannel';
import { DiagnosticsManager } from '../diagnostics';
import { StatusBarItem } from '../statusBarItem';
import { getSidebarHtml } from './sidebarHtml';
import { GitUtils } from '../../utils/gitUtils';
import { Logger } from '../../utils/logger';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'ros2.buildSidebar';

    private view?: vscode.WebviewView;
    private scanner: PackageScanner;
    private builder: ColconBuilder;
    private settings: Settings;
    private outputChannel: OutputChannelManager;
    private diagnostics: DiagnosticsManager;
    private statusBarItem: StatusBarItem;
    private selectedPackages: Set<string> = new Set();
    private context: vscode.ExtensionContext;
    private logger: Logger;

    constructor(
        private readonly extensionUri: vscode.Uri,
        scanner: PackageScanner,
        builder: ColconBuilder,
        settings: Settings,
        outputChannel: OutputChannelManager,
        diagnostics: DiagnosticsManager,
        statusBarItem: StatusBarItem,
        context: vscode.ExtensionContext
    ) {
        this.scanner = scanner;
        this.builder = builder;
        this.settings = settings;
        this.outputChannel = outputChannel;
        this.diagnostics = diagnostics;
        this.statusBarItem = statusBarItem;
        this.context = context;
        this.logger = Logger.getInstance();

        // 设置编译进度回调
        this.builder.setOnProgressCallback((progress) => {
            this.updateWebview({
                type: 'buildProgress',
                current: progress.current,
                total: progress.total,
                packageName: progress.packageName
            });
        });

        // 恢复之前保存的选中状态
        this.loadSelectionState();
    }

    private loadSelectionState(): void {
        const saved = this.context.workspaceState.get<string[]>('ros2.selectedPackages', []);
        this.selectedPackages = new Set(saved);
    }

    private saveSelectionState(): void {
        this.context.workspaceState.update('ros2.selectedPackages', Array.from(this.selectedPackages));
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        console.log('ROS2 Build: resolveWebviewView called');
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        const html = this.getHtml(webviewView.webview);
        this.logger.info(`Setting webview HTML, length: ${html.length}`);
        webviewView.webview.html = html;

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'buildSelected':
                    await this.buildSelectedPackages();
                    break;
                case 'buildCurrent':
                    await vscode.commands.executeCommand('ros2.buildCurrent');
                    break;
                case 'buildAll':
                    await vscode.commands.executeCommand('ros2.buildAll');
                    break;
                case 'buildWithDeps':
                    await vscode.commands.executeCommand('ros2.buildWithDeps');
                    break;
                case 'clean':
                    await vscode.commands.executeCommand('ros2.clean');
                    break;
                case 'cleanRebuild':
                    await vscode.commands.executeCommand('ros2.cleanRebuild');
                    break;
                case 'buildDocker':
                    await vscode.commands.executeCommand('ros2.buildDocker');
                    break;
                case 'selectPackage':
                    this.togglePackageSelection(message.packageName, message.selected);
                    break;
                case 'selectGroup':
                    this.toggleGroupSelection(message.groupName, message.selected);
                    break;
                case 'refresh':
                    await this.refreshPackages();
                    break;
                case 'cancelBuild':
                    this.cancelBuild();
                    break;
                case 'autoSelectByGit':
                    await this.autoSelectByGitChanges();
                    break;
                case 'clearSelection':
                    this.clearSelection();
                    break;
                case 'selectAll':
                    this.selectAllPackages();
                    break;
                case 'getSystemInfo':
                    this.sendSystemInfo();
                    break;
                case 'setBuildType':
                    // Update settings
                    break;
                case 'setWorkers':
                    // Update settings
                    break;
            }
        });
    }

    private async buildSelectedPackages(): Promise<void> {
        const packages = this.getSelectedPackages();
        if (packages.length === 0) {
            vscode.window.showWarningMessage('No packages selected');
            return;
        }

        this.logger.info(`Building ${packages.length} selected packages: ${packages.map(p => p.name).join(', ')}`);
        await this.executeBuild(packages);
    }

    public async buildAllPackages(): Promise<void> {
        const packages = this.scanner.getAllPackages();
        if (packages.length === 0) {
            vscode.window.showWarningMessage('No packages found');
            return;
        }

        this.logger.info(`Building all ${packages.length} packages`);
        await this.executeBuild(packages);
    }

    private async executeBuild(packages: Ros2Package[]): Promise<void> {
        this.logger.info(`Starting build for ${packages.length} packages`);
        this.diagnostics.clear();
        this.statusBarItem.setStatus('building');
        this.updateWebview({ type: 'buildStart' });

        const startTime = Date.now();
        const result = await this.builder.build(packages);
        const duration = Date.now() - startTime;

        // 检查是否被取消
        if (this.builder.getIsCancelled()) {
            this.logger.info('Build cancelled by user');
            this.statusBarItem.setStatus('idle', 'Cancelled');
            this.updateWebview({ type: 'buildCancelled' });
            return;
        }

        this.logger.info(`Build completed in ${(duration / 1000).toFixed(1)}s: ${result.totalErrors} errors, ${result.totalWarnings} warnings`);

        this.statusBarItem.setStatus(
            result.success ? 'success' : 'failed',
            `${result.totalErrors} errors, ${result.totalWarnings} warnings`
        );

        // Update diagnostics
        for (const pkgResult of result.packages.values()) {
            this.diagnostics.addDiagnostics(pkgResult.errors);
            this.diagnostics.addDiagnostics(pkgResult.warnings);
        }

        // 收集错误和警告文本用于复制
        let errorText = '';
        for (const [pkgName, pkgResult] of result.packages) {
            if (pkgResult.errors.length > 0 || pkgResult.warnings.length > 0) {
                errorText += `=== ${pkgName} ===\n`;
                for (const err of pkgResult.errors) {
                    errorText += `ERROR: ${err.file}:${err.line}:${err.column}: ${err.message}\n`;
                }
                for (const warn of pkgResult.warnings) {
                    errorText += `WARNING: ${warn.file}:${warn.line}:${warn.column}: ${warn.message}\n`;
                }
                errorText += '\n';
            }
        }

        this.updateWebview({
            type: 'buildComplete',
            success: result.success,
            errors: result.totalErrors,
            warnings: result.totalWarnings,
            duration: result.duration,
            errorText: errorText.trim() || 'Build completed with no detailed error information.'
        });
    }

    private cancelBuild(): void {
        this.builder.cancelBuild();
    }

    private async autoSelectByGitChanges(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        this.logger.info(`Auto selecting packages by Git changes in ${workspaceRoot}`);

        // 检查是否是 git 仓库
        const isGit = await GitUtils.isGitRepository(workspaceRoot);
        if (!isGit) {
            this.logger.warn('Workspace is not a Git repository');
            vscode.window.showWarningMessage('当前工作空间不是 Git 仓库，无法自动检测修改');
            return;
        }

        // 获取修改的文件
        const changedFiles = await GitUtils.getChangedFiles(workspaceRoot);
        this.logger.info(`Found ${changedFiles.length} changed files`);
        if (changedFiles.length === 0) {
            vscode.window.showInformationMessage('没有检测到 Git 修改');
            return;
        }

        // 构建包路径映射
        const allPackages = this.scanner.getAllPackages();
        const packageMap = new Map<string, { name: string; path: string }>();
        for (const pkg of allPackages) {
            const relativePath = pkg.relativePath;
            packageMap.set(relativePath, { name: pkg.name, path: relativePath });
        }

        // 推断修改了哪些包
        const matchedPackageNames = GitUtils.inferPackagesFromFiles(changedFiles, packageMap);
        this.logger.info(`Inferred ${matchedPackageNames.length} packages from Git changes: ${matchedPackageNames.join(', ')}`);

        if (matchedPackageNames.length === 0) {
            vscode.window.showInformationMessage('无法从 Git 修改中推断出相关功能包');
            return;
        }

        // 选中这些包
        this.selectedPackages.clear();
        for (const pkgName of matchedPackageNames) {
            this.selectedPackages.add(pkgName);
        }
        this.saveSelectionState();

        // 更新 UI
        this.updateWebview({
            type: 'refresh',
            html: this.renderPackageTreeHtml()
        });

        vscode.window.showInformationMessage(
            `Auto selected ${matchedPackageNames.length} packages: ${matchedPackageNames.join(', ')}`
        );
    }

    private clearSelection(): void {
        this.selectedPackages.clear();
        this.saveSelectionState();
        this.updateWebview({
            type: 'refresh',
            html: this.renderPackageTreeHtml()
        });
    }

    private selectAllPackages(): void {
        const allPackages = this.scanner.getAllPackages();

        // 检查是否已经全选
        const allSelected = allPackages.every(pkg => this.selectedPackages.has(pkg.name));

        if (allSelected) {
            // 已经全选，取消全选
            this.selectedPackages.clear();
            this.logger.info('Deselected all packages');
        } else {
            // 未全选，全选
            for (const pkg of allPackages) {
                this.selectedPackages.add(pkg.name);
            }
            this.logger.info(`Selected all ${allPackages.length} packages`);
        }

        this.saveSelectionState();
        this.updateWebview({
            type: 'refresh',
            html: this.renderPackageTreeHtml()
        });
    }

    private sendSystemInfo(): void {
        const cpuUsage = this.getCpuUsage();
        const memInfo = this.getMemInfo();
        const optimalWorkers = this.getOptimalWorkers(memInfo.usagePercent);

        this.updateWebview({
            type: 'systemInfo',
            cpuUsage: cpuUsage,
            memTotal: memInfo.total,
            memUsed: memInfo.used,
            memFree: memInfo.free,
            memUsagePercent: memInfo.usagePercent,
            swapTotal: memInfo.swapTotal,
            swapUsed: memInfo.swapUsed,
            swapFree: memInfo.swapFree,
            swapUsagePercent: memInfo.swapUsagePercent,
            optimalWorkers: optimalWorkers
        });
    }

    private getCpuUsage(): number {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        for (const cpu of cpus) {
            for (const type in cpu.times) {
                totalTick += (cpu.times as any)[type];
            }
            totalIdle += cpu.times.idle;
        }

        return Math.round(100 - (100 * totalIdle / totalTick));
    }

    private getMemInfo(): {
        total: number; used: number; free: number; usagePercent: number;
        swapTotal: number; swapUsed: number; swapFree: number; swapUsagePercent: number;
    } {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const usagePercent = Math.round((usedMem / totalMem) * 100);

        // 获取交换内存信息
        let swapTotal = 0;
        let swapUsed = 0;
        let swapFree = 0;
        let swapUsagePercent = 0;

        try {
            const { execSync } = require('child_process');
            const swapInfo = execSync('free -b | grep Swap', { encoding: 'utf-8' });
            const parts = swapInfo.trim().split(/\s+/);
            if (parts.length >= 3) {
                swapTotal = parseInt(parts[1]) || 0;
                swapUsed = parseInt(parts[2]) || 0;
                swapFree = swapTotal - swapUsed;
                swapUsagePercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;
            }
        } catch (e) {
            // 如果无法获取交换内存信息，使用默认值
        }

        return {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usagePercent,
            swapTotal,
            swapUsed,
            swapFree,
            swapUsagePercent
        };
    }

    private getOptimalWorkers(memUsagePercent: number): number {
        const cpuCount = os.cpus().length;

        // 根据 CPU 和内存使用情况调整并行数
        if (memUsagePercent > 90) {
            return 1;  // 内存紧张，单线程
        } else if (memUsagePercent > 70) {
            return Math.max(1, Math.floor(cpuCount / 2));  // 内存较高，减半
        } else {
            return cpuCount;  // 正常情况，使用所有 CPU
        }
    }

    public getSelectedPackages(): Ros2Package[] {
        const allPackages = this.scanner.getAllPackages();
        return allPackages.filter(pkg => this.selectedPackages.has(pkg.name));
    }

    private togglePackageSelection(packageName: string, selected: boolean): void {
        if (selected) {
            this.selectedPackages.add(packageName);
        } else {
            this.selectedPackages.delete(packageName);
        }
        this.saveSelectionState();
    }

    private toggleGroupSelection(groupName: string, selected: boolean): void {
        const groupPackages = this.scanner.getPackagesByGroup(groupName);
        for (const pkg of groupPackages) {
            if (selected) {
                this.selectedPackages.add(pkg.name);
            } else {
                this.selectedPackages.delete(pkg.name);
            }
        }
        this.saveSelectionState();
    }

    public async refreshPackages(): Promise<void> {
        await this.scanner.scanAllPackages();
        this.updateWebview({ type: 'refresh', html: this.renderPackageTreeHtml() });
    }

    public refresh(): void {
        if (this.view) {
            this.updateWebview({ type: 'refresh', html: this.renderPackageTreeHtml() });
        }
    }

    private getPackageTree(): any[] {
        const packages = this.scanner.getAllPackages();
        const groups = new Map<string, Ros2Package[]>();

        for (const pkg of packages) {
            if (!groups.has(pkg.group)) {
                groups.set(pkg.group, []);
            }
            groups.get(pkg.group)!.push(pkg);
        }

        const tree: any[] = [];
        for (const [group, pkgs] of groups) {
            tree.push({
                name: group,
                packages: pkgs.map(p => ({
                    name: p.name,
                    buildType: p.buildType,
                    selected: this.selectedPackages.has(p.name)
                }))
            });
        }

        return tree;
    }

    private renderPackageTreeHtml(): string {
        const packageTree = this.getPackageTree();
        let html = '';

        for (const group of packageTree) {
            const groupId = group.name.replace(/[^a-zA-Z0-9]/g, '-');
            // 计算 group 的选中状态：所有子包都被选中时，group 也勾选
            const allSelected = group.packages.length > 0 && group.packages.every((p: any) => p.selected);
            const someSelected = group.packages.some((p: any) => p.selected);

            html += `<div class="group" id="group-${groupId}">
                <div class="group-header" onclick="toggleGroup('${groupId}')">
                    <span class="group-toggle" id="toggle-${groupId}">&#9654;</span>
                    <span class="group-name">${group.name}</span>
                    <span class="group-count">(${group.packages.length})</span>
                    <input type="checkbox" class="group-select" ${allSelected ? 'checked' : ''} onclick="event.stopPropagation(); selectGroup('${groupId}', this.checked)">
                </div>
                <div class="packages" id="packages-${groupId}">`;

            for (const pkg of group.packages) {
                html += `<div class="package-item">
                    <input type="checkbox" data-package="${pkg.name}"
                        ${pkg.selected ? 'checked' : ''}
                        onchange="togglePackage('${pkg.name}', this.checked)">
                    <span class="package-name">${pkg.name}</span>
                    <span class="package-type">${pkg.buildType === 'ament_cmake' ? 'C++' : 'Py'}</span>
                </div>`;
            }

            html += `</div></div>`;
        }

        return html;
    }

    private updateWebview(message: any): void {
        if (this.view) {
            this.view.webview.postMessage(message);
        }
    }

    private getHtml(webview: vscode.Webview): string {
        return getSidebarHtml(webview, this.extensionUri, this.settings, this.renderPackageTreeHtml());
    }
}
