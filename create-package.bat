@echo off
echo Creating Chrome Web Store package...

:: Create temporary directory
if exist temp_package rmdir /s /q temp_package
mkdir temp_package

:: Copy required files
copy manifest.json temp_package\
copy background.js temp_package\
copy content.js temp_package\
copy sidepanel.html temp_package\
copy sidepanel.js temp_package\
copy sidepanel.css temp_package\
copy styles.css temp_package\
copy logo.png temp_package\
copy README.md temp_package\
copy PRIVACY.md temp_package\

:: Copy icons directory
xcopy icons temp_package\icons\ /E /I

:: Create zip file (requires PowerShell)
powershell -command "Compress-Archive -Path 'temp_package\*' -DestinationPath 'twitter-podcast-extension.zip' -Force"

:: Clean up
rmdir /s /q temp_package

echo.
echo ✅ Package created: twitter-podcast-extension.zip
echo 🚀 Ready for Chrome Web Store submission!
echo.
pause