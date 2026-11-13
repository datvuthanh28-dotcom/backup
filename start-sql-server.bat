@echo off
echo ====================================================
echo DANG KHOI DONG MICROSOFT SQL SERVER...
echo ====================================================

powershell -Command "Start-Process cmd -ArgumentList '/c net start MSSQLSERVER & pause' -Verb RunAs"
