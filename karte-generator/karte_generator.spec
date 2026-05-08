# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['generate_gui.py'],
    pathex=[],
    binaries=[],
    datas=[
        # generate.py を data として含める（generate_gui.py が import するため）
        ('generate.py', '.'),
        ('photo_annotator.py', '.'),
    ],
    hiddenimports=[
        'openpyxl',
        'PIL',
        'PIL.Image',
        'tkinter',
        'tkinter.ttk',
        'tkinter.filedialog',
        'tkinter.messagebox',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='街路樹カルテ生成',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # GUIアプリなのでコンソールは非表示
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='icon.ico',  # アイコンを使う場合はコメント解除
)
