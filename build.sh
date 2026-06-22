#!/bin/bash

# Build script for vscode-ros2-colcon-build extension

set -e

echo "Installing dependencies..."
npm install

echo "Compiling TypeScript..."
npm run compile

echo "Build complete!"
echo ""
echo "To test the extension:"
echo "1. Open VSCode"
echo "2. Press F5 to launch Extension Development Host"
echo "3. Open a ROS2 workspace"
echo ""
echo "To package the extension:"
echo "npm install -g vsce"
echo "vsce package"
