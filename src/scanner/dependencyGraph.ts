import { Ros2Package } from '../types';

export class DependencyGraph {
    private adjacencyList: Map<string, Set<string>> = new Map();
    private packageMap: Map<string, Ros2Package> = new Map();

    constructor(packages: Ros2Package[]) {
        // Build package map
        for (const pkg of packages) {
            this.packageMap.set(pkg.name, pkg);
        }

        // Build adjacency list (package -> its dependencies)
        for (const pkg of packages) {
            if (!this.adjacencyList.has(pkg.name)) {
                this.adjacencyList.set(pkg.name, new Set());
            }
            for (const dep of pkg.dependencies) {
                if (this.packageMap.has(dep)) {
                    this.adjacencyList.get(pkg.name)!.add(dep);
                }
            }
        }
    }

    getTransitiveDependencies(packageNames: string[]): Ros2Package[] {
        const visited = new Set<string>();
        const result: Ros2Package[] = [];

        const dfs = (name: string) => {
            if (visited.has(name)) {
                return;
            }
            visited.add(name);

            const pkg = this.packageMap.get(name);
            if (!pkg) {
                return;
            }

            // Visit dependencies first
            const deps = this.adjacencyList.get(name);
            if (deps) {
                for (const dep of deps) {
                    dfs(dep);
                }
            }

            result.push(pkg);
        };

        for (const name of packageNames) {
            dfs(name);
        }

        return result;
    }

    getTopologicalOrder(packageNames: string[]): Ros2Package[] {
        return this.getTransitiveDependencies(packageNames);
    }

    getPackageDependencies(packageName: string): string[] {
        const deps = this.adjacencyList.get(packageName);
        return deps ? Array.from(deps) : [];
    }

    getPackageDependents(packageName: string): string[] {
        const dependents: string[] = [];
        for (const [pkg, deps] of this.adjacencyList) {
            if (deps.has(packageName)) {
                dependents.push(pkg);
            }
        }
        return dependents;
    }

    hasCircularDependency(): boolean {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (name: string): boolean => {
            visited.add(name);
            recursionStack.add(name);

            const deps = this.adjacencyList.get(name);
            if (deps) {
                for (const dep of deps) {
                    if (!visited.has(dep)) {
                        if (hasCycle(dep)) {
                            return true;
                        }
                    } else if (recursionStack.has(dep)) {
                        return true;
                    }
                }
            }

            recursionStack.delete(name);
            return false;
        };

        for (const pkg of this.adjacencyList.keys()) {
            if (!visited.has(pkg)) {
                if (hasCycle(pkg)) {
                    return true;
                }
            }
        }

        return false;
    }
}
