# Run Portal Data Epistem on Windows

The prepared application runs locally in a browser. Python 3 serves the files. Node.js, R and geospatial Python libraries are not required to use the prepared data.

## Prepare the synced folder

Use your cloned `DemoPortalData` folder. If you use a OneDrive copy instead, find `20261011_PortalDataEpistem` in your synced folder.

In File Explorer, make these files and folders available locally using **Always keep on this device**:

- `index.html` and `styles.css`.
- `src`, `vendor` and `data`.
- `start-windows.bat`, when using the launcher.

Wait until OneDrive finishes downloading them. The development `.work` folder is not needed for ordinary browser use.

## Start manually

Open a terminal in the project folder, for example with **Open in Terminal** in File Explorer. Run:

```powershell
py -3 -m http.server 8765 --bind 127.0.0.1
```

If your Python installation provides `python` instead of `py`, use:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open <http://127.0.0.1:8765/> in Edge, Chrome or Firefox. Keep the terminal open. Press **Ctrl+C** in the terminal to stop the server.

Do not open `index.html` directly. If neither Python command works, install Python 3 from [python.org](https://www.python.org/downloads/windows/), reopen the terminal and try again.

## Start with the launcher

Double-click `start-windows.bat`. It checks for Python, starts the local server and opens the browser. Leave its terminal open while using the portal.

The launcher is provided for convenience. It was reviewed on macOS; Windows execution still needs a check on your PC.

## What carries between computers

Source and prepared files sync through OneDrive. Browser drafts, private combinations, reviews and display preferences do not. They belong to one browser profile and origin. A different PC, browser or port starts with separate browser storage.

Online basemaps require internet access. If imagery cannot load, the local observation points and boundary remain usable. The study recording period does not establish the acquisition date of a basemap mosaic.

If port 8765 is already in use, stop the previous server or choose another port, such as 8766, in both the command and browser address. A different port has separate browser storage.

The default is Topografi · OpenTopoMap, matching the default observed in OpenLandMap on 12 October 2026. Use Lapisan to select OpenStreetMap, EOX 2025 satellite imagery or the neutral local background. A tile failure preserves your selection for the next session.
