; Argus CLI Windows Installer
; Built with NSIS (Nullsoft Scriptable Install System)

!define PRODUCT_NAME "Argus"
!define PRODUCT_PUBLISHER "darkden-lab"
!define PRODUCT_WEB_SITE "https://github.com/darkden-lab/argus"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; Version is passed via makensis -DVERSION=x.y.z
!ifndef VERSION
  !define VERSION "0.0.0"
!endif

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "argus-${VERSION}-windows-amd64-setup.exe"
InstallDir "$PROGRAMFILES\Argus"
InstallDirRegKey HKLM "Software\${PRODUCT_NAME}" "InstallDir"
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin

;---------- Installer Sections ----------

Section "Argus CLI" SEC_MAIN
  SectionIn RO
  SetOutPath "$INSTDIR"
  File "argus.exe"

  ; Store installation folder
  WriteRegStr HKLM "Software\${PRODUCT_NAME}" "InstallDir" "$INSTDIR"

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Add/Remove Programs entry
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"

  ; Add to PATH
  EnVar::AddValue "PATH" "$INSTDIR"
SectionEnd

;---------- Uninstaller Section ----------

Section "Uninstall"
  ; Remove files
  Delete "$INSTDIR\argus.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  ; Remove from PATH
  EnVar::DeleteValue "PATH" "$INSTDIR"

  ; Remove registry keys
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "Software\${PRODUCT_NAME}"
SectionEnd
