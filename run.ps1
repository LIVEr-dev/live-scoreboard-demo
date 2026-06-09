# Run script for Windows PowerShell
# Installs dependencies and starts the optional server

Write-Host "Installing dependencies..."
npm install

Write-Host "Starting server on http://localhost:3000"
npm start
