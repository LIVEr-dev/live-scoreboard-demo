#!/usr/bin/env bash
# Simple run script for Unix-like systems
set -e

echo "Installing dependencies..."
npm install

echo "Starting server on http://localhost:3000"
npm start
