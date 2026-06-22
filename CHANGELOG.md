# Changelog

All notable changes to the "ROS2 Colcon Build" extension will be documented in this file.

## [1.1.1] - 2026-06-22

### Fixed

- Updated GitHub repository address to https://github.com/HappyChaoChao/vscode-ros2-colcon-build

## [1.1.0] - 2026-06-22

### Added

- Git Smart Select: auto-select packages based on Git changes
- Cancel Build: cancel long-running builds at any time
- Clear Selection: clear all selected packages
- Select All: toggle select all packages (click again to deselect)
- System Monitoring: real-time CPU and memory usage display
- Memory Info: separate display for physical memory and swap memory
- Progress Tracking: build progress with package count and percentage
- Resizable Panels: drag to resize the package list area
- Runtime Logging: detailed logs for debugging (OutputChannel + log file)
- Remote SSH Support: full support for VSCode Remote SSH mode

### Fixed

- Package tree rendering after Git selection
- Build output not showing on second build
- Error panel not displaying on build failure

### Changed

- Improved UI layout with better spacing
- Improved error messages with color coding (red for errors, yellow for warnings)

## [1.0.0] - 2026-06-18

### Added

- Initial release
- Package scanning and discovery
- Visual package selection with checkboxes
- Build type selection (Release/Debug/RelWithDebInfo)
- Parallel workers configuration
- Symlink install option
- Continue on error option
- Local colcon build support
- Docker cross-compilation for ARM64
- Real-time build output parsing
- Error and warning detection
- VSCode Diagnostics integration
- Click-to-jump to source code
- Error copy functionality for AI analysis
- Build history tracking
- Package search and filter
- Group expansion/collapse
- Status bar integration
- Build progress indication
- Selection persistence across sessions
