# -*- mode: python ; coding: utf-8 -*-
# Сборка Sherpa.exe:  pyinstaller launcher/sherpa.spec  (из корня проекта, после npm run build)
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

root = os.path.abspath(os.path.join(SPECPATH, '..'))

# pywebview тянет .NET-сборки WebView2 и pythonnet — забираем всё
wv_datas, wv_bins, wv_hidden = collect_all('webview')
clr_datas, clr_bins, clr_hidden = collect_all('clr_loader')
pn_datas, pn_bins, pn_hidden = collect_all('pythonnet')

a = Analysis(
    [os.path.join(root, 'launcher', 'sherpa.py')],
    pathex=[root],
    binaries=wv_bins + clr_bins + pn_bins,
    datas=[(os.path.join(root, 'dist'), 'dist')]
        + ([(os.path.join(root, 'launcher', 'bin', 'cloudflared.exe'), 'bin')] if os.path.exists(os.path.join(root, 'launcher', 'bin', 'cloudflared.exe')) else [])
        + wv_datas + clr_datas + pn_datas,
    hiddenimports=wv_hidden + clr_hidden + pn_hidden + collect_submodules('webview.platforms') + ['clr', 'winreg'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pydoc', 'doctest'],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Sherpa',
    debug=False,
    strip=False,
    upx=False,
    console=False,          # без консоли; вывод — в sherpa.log рядом с exe
    icon=os.path.join(root, 'launcher', 'sherpa.ico') if os.path.exists(os.path.join(root, 'launcher', 'sherpa.ico')) else None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='Sherpa',
)
