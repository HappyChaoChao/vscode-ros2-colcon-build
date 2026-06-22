# ROS2 Colcon Build

A Visual Studio Code extension for ROS2 developers that provides a visual interface for building colcon packages.

## Features

- **Dynamic Package Discovery**: Automatically scans and discovers all ROS2 packages in your workspace
- **Visual Package Selection**: Select packages with checkboxes, grouped by functional area
- **Build Type Selection**: Choose between Release, Debug, and RelWithDebInfo
- **Real-time Error Parsing**: Compiler errors and warnings are parsed and displayed in the Problems panel
- **Click to Jump**: Click on errors to jump directly to the source code location
- **Docker Cross-Compilation**: Build for ARM64 targets using Docker buildx
- **Build History**: Track and replay previous builds
- **Selection Persistence**: Package selections are saved across VSCode sessions
- **Copy Errors**: One-click copy build errors for AI analysis
- **Git Smart Select**: Auto-select packages based on Git changes
- **Cancel Build**: Cancel long-running builds at any time
- **System Monitoring**: Real-time CPU and memory usage display
- **Progress Tracking**: Build progress with package count and percentage
- **Resizable Panels**: Drag to resize the package list area

## Installation

### From VSIX

1. Download the `.vsix` file
2. Open VSCode
3. Press `Ctrl+Shift+X` to open Extensions
4. Click `...` menu → `Install from VSIX...`
5. Select the downloaded file

### From Marketplace

Search for "ROS2 Colcon Build" in the VSCode Extensions marketplace.

## Quick Start

1. Open a ROS2 workspace in VSCode
2. Click the **ROS2 Build** icon in the Activity Bar
3. Select packages to build
4. Click **Build Selected**

## Usage

### Sidebar Panel

The extension adds a "ROS2 Build" icon to the Activity Bar. Click it to open the build panel.

```
+------------------------------------------+
|  Build Mode: [Local] [Docker ARM64]      |
+------------------------------------------+
|  Configuration:                          |
|    Build Type: [Release ▼]               |
|    Parallel Workers: [====|====] 4       |
|    [✓] Symlink Install                   |
|    [ ] Continue on Error                 |
+------------------------------------------+
|  Packages     [All][Git][Clear][Refresh] |
|    ▼ my_drivers (5)                      |
|      [✓] motor_driver                   |
|      [ ] sensor_driver                  |
|    ▼ my_navigation (8)                   |
|      [ ] path_planner                   |
|      [ ] obstacle_avoidance             |
|    ▼ my_perception (4)                   |
|      [ ] camera_node                    |
|      [ ] lidar_processor                |
|    ---- Drag to resize ----              |
+------------------------------------------+
|  CPU: 45%  Workers: 4                    |
|  Mem: 62% (8.2GB/13.2GB) Swap: 12%      |
|  2/5 (40%)                               |
|  [===========>                    ]       |
+------------------------------------------+
|  Status: Building: path_planner...       |
+------------------------------------------+
```

### Example Workflow

```bash
# 1. Open your ROS2 workspace
cd /home/user/my_robot_ws
code .

# 2. Click the ROS2 Build icon in the Activity Bar

# 3. Select packages to build
#    - Click "All" to select all packages
#    - Or click individual checkboxes
#    - Use "Git" to auto-select packages with recent changes

# 4. Configure build options
#    - Build Type: Release (for production) or Debug (for debugging)
#    - Parallel Workers: Auto-adjusted based on CPU/Memory

# 5. Click "Build Selected" to start building

# 6. Monitor progress
#    - Progress bar shows current/total packages
#    - CPU and memory usage displayed
#    - Errors shown in Problems panel
#    - Click errors to jump to source code
```

### Commands

| Command | Description |
|---------|-------------|
| ROS2: Build Selected Packages | Build selected packages |
| ROS2: Build Current Package | Build package containing current file |
| ROS2: Build All Packages | Build all packages |
| ROS2: Build Package with Dependencies | Build with dependencies |
| ROS2: Clean Build | Remove build directories |
| ROS2: Clean + Rebuild All | Clean and rebuild everything |
| ROS2: Build in Docker (ARM64) | Cross-compile using Docker |
| ROS2: Show Build History | View previous builds |
| ROS2: Scan Packages | Rescan workspace packages |

### Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `ros2-colcon-build.defaultBuildType` | Default build type | Release |
| `ros2-colcon-build.defaultParallelWorkers` | Default parallel workers | 4 |
| `ros2-colcon-build.defaultSymlinkInstall` | Use symlink install | true |
| `ros2-colcon-build.defaultContinueOnError` | Continue on error | false |
| `ros2-colcon-build.docker.enabled` | Enable Docker | false |
| `ros2-colcon-build.docker.builderName` | Docker builder name | arm64-builder |
| `ros2-colcon-build.docker.platform` | Docker platform | linux/arm64 |
| `ros2-colcon-build.colconArgs` | Extra colcon arguments | [] |

## Remote SSH Support

This extension fully supports VSCode Remote SSH mode:

1. Connect to remote host via VSCode Remote SSH
2. Open ROS2 workspace on remote host
3. Use the extension normally

All operations (file scanning, command execution, system monitoring) run on the remote host.

## Requirements

- VSCode 1.80 or later
- ROS2 Humble installed
- colcon build tools installed
- Docker (optional, for cross-compilation)

## Known Issues

- Large workspaces may take a moment to scan on first activation
- Docker build output parsing may not capture all error formats

## Release Notes

### 1.1.0

- Added Git Smart Select: auto-select packages based on Git changes
- Added Cancel Build: cancel long-running builds
- Added Clear Selection: clear all selected packages
- Added Select All: toggle select all packages
- Added System Monitoring: real-time CPU and memory usage
- Added Progress Tracking: build progress with package count
- Added Resizable Panels: drag to resize package list
- Added Runtime Logging: detailed logs for debugging
- Fixed package tree rendering after Git selection

### 1.0.0

- Initial release
- Package scanning and discovery
- Visual package selection
- Local and Docker builds
- Error parsing and diagnostics
- Build history

## License

MIT

## Repository

[GitHub - vscode-ros2-colcon-build](https://github.com/HappyChaoChao/vscode-ros2-colcon-build)
