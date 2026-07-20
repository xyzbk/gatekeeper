@echo off
call pnpm run judge
exit /b %ERRORLEVEL%
