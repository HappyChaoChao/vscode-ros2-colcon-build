import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Ros2Package } from '../types';
import { PackageXmlParser } from './packageXmlParser';
import { GroupResolver } from './groupResolver';
import { DependencyGraph } from './dependencyGraph';
import { Logger } from '../utils/logger';

export class PackageScanner {
    private packages: Map<string, Ros2Package> = new Map();
    private parser: PackageXmlParser;
    private groupResolver: GroupResolver | null = null;
    private dependencyGraph: DependencyGraph | null = null;
    private workspaceRoot: string = '';
    private logger: Logger;

    constructor() {
        this.parser = new PackageXmlParser();
        this.logger = Logger.getInstance();
    }

    async scanAllPackages(): Promise<Ros2Package[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.logger.warn('No workspace folder open');
            return [];
        }

        this.workspaceRoot = workspaceFolders[0].uri.fsPath;
        this.groupResolver = new GroupResolver(this.workspaceRoot);

        this.logger.info(`Scanning packages in ${this.workspaceRoot}`);

        // 使用 VSCode findFiles API 查找所有 package.xml
        // 排除 build, install, log 目录
        const excludePattern = '**/build/**';
        const files = await vscode.workspace.findFiles('src/**/package.xml', excludePattern);

        this.logger.info(`Found ${files.length} package.xml files`);
        this.packages.clear();

        // 并行解析所有 package.xml
        const parsePromises = files.map(async (file) => {
            try {
                const content = await fs.promises.readFile(file.fsPath, 'utf-8');
                const xmlInfo = this.parser.parse(content);
                const stats = await fs.promises.stat(file.fsPath);
                const packageDir = path.dirname(file.fsPath);
                const relativePath = path.relative(this.workspaceRoot, packageDir);
                const group = this.groupResolver!.resolveGroup(packageDir);

                const pkg: Ros2Package = {
                    name: xmlInfo.name,
                    path: packageDir,
                    relativePath: relativePath,
                    group: group,
                    buildType: xmlInfo.buildType,
                    dependencies: xmlInfo.dependencies,
                    description: xmlInfo.description,
                    mtime: stats.mtimeMs
                };

                this.packages.set(pkg.name, pkg);
            } catch (error) {
                this.logger.error(`Error parsing ${file.fsPath}`, error as Error);
            }
        });

        await Promise.all(parsePromises);

        // Build dependency graph
        const packageList = Array.from(this.packages.values());
        this.dependencyGraph = new DependencyGraph(packageList);

        this.logger.info(`Successfully scanned ${packageList.length} packages`);

        return packageList;
    }

    async findPackageByFilePath(filePath: string): Promise<Ros2Package | null> {
        this.logger.debug(`Finding package for file: ${filePath}`);
        let currentDir = path.dirname(filePath);

        while (currentDir && currentDir !== this.workspaceRoot) {
            const packageXmlPath = path.join(currentDir, 'package.xml');
            try {
                await fs.promises.access(packageXmlPath);
                const content = await fs.promises.readFile(packageXmlPath, 'utf-8');
                const xmlInfo = this.parser.parse(content);
                const pkg = this.packages.get(xmlInfo.name) || null;
                if (pkg) {
                    this.logger.debug(`Found package: ${pkg.name} for file: ${filePath}`);
                }
                return pkg;
            } catch {
                currentDir = path.dirname(currentDir);
            }
        }

        this.logger.debug(`No package found for file: ${filePath}`);
        return null;
    }

    getPackagesWithDependencies(packages: Ros2Package[]): Ros2Package[] {
        if (!this.dependencyGraph) {
            return packages;
        }
        return this.dependencyGraph.getTransitiveDependencies(
            packages.map(p => p.name)
        );
    }

    getPackageByName(name: string): Ros2Package | undefined {
        return this.packages.get(name);
    }

    getAllPackages(): Ros2Package[] {
        return Array.from(this.packages.values());
    }

    getPackagesByGroup(group: string): Ros2Package[] {
        return Array.from(this.packages.values()).filter(p => p.group === group);
    }

    getGroups(): string[] {
        if (!this.groupResolver) {
            return [];
        }
        return this.groupResolver.getAllGroups(Array.from(this.packages.values()));
    }

    getDependencyGraph(): DependencyGraph | null {
        return this.dependencyGraph;
    }
}
