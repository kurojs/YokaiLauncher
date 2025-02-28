<p align="center">
  <img src="https://i.imgur.com/MAP6we4.png" alt="YokaiLauncher" width="400">
</p>

<p align="center">Join modded servers without worrying about installing Java, Forge, or other mods. We'll handle that for you.</p>

<p align="center">
  <img src="https://i.imgur.com/W1VqT9X.png" alt="Screenshot 1" width="500">
</p>

<p align="center">
  <img src="https://i.imgur.com/U3ZnlqV.png" alt="Screenshot 2" width="500">
</p>

## Features

* 👾 Full account management.
  * Add multiple accounts and easily switch between them.
  * Microsoft (OAuth 2.0).
  * Credentials are never stored and transmitted directly to Mojang.
* 📌 Efficient asset management.
  * Files are validated before launch. Corrupt or incorrect files will be redownloaded.
* 👻 **Automatic Java validation.**
  * If you have an incompatible version of Java installed, we'll install the right one *for you*.
  * You do not need to have Java installed to run the launcher.
* 📰 News feed into the launcher.
* ⚙️ Intuitive settings management, including a Java control panel.

This is not an exhaustive list. Download and install the launcher to gauge all it can do!

#### Need Help? [Check the wiki.][wiki]

## Downloads

You can download from [GitHub Releases](https://github.com/kurojs/YokaiLauncher/releases)

**Supported Platforms**

| Platform | File |
| -------- | ---- |
| Windows x64 | `Yokai-Launcher-setup-VERSION.exe` |
| macOS x64 | `Yokai-Launcher-setup-VERSION-x64.dmg` |
| macOS arm64 | `Yokai-Launcher-setup-VERSION-arm64.dmg` |
| Linux x64 | `Yokai-Launcher-setup-VERSION.AppImage` |

## Development

**System Requirements**

* [Node.js][nodejs] v20

---

**Clone and Install Dependencies**

```console
> git clone https://github.com/kurojs/YokaiLauncher.git
> cd YokaiLauncher
> npm install
```

---

**Launch Application**

```console
> npm start
```

---

**Build Installers**

To build for your current platform.

```console
> npm run dist
```

Build for a specific platform.

| Platform    | Command              |
| ----------- | -------------------- |
| Windows x64 | `npm run dist:win`   |
| macOS       | `npm run dist:mac`   |
| Linux x64   | `npm run dist:linux` |

Builds for macOS may not work on Windows/Linux and vice-versa.

---

### Credits and notes

This project is a modified fork of [Helios Launcher](https://github.com/dscalzi/HeliosLauncher), originally created by [Dscalzi](https://github.com/dscalzi).  
For support or more details, please refer to the [original repository](https://github.com/dscalzi/HeliosLauncher).  

## License

This project is licensed under the [MIT License](LICENSE).  
Original copyright (c) 2017-2024 [Daniel D. Scalzi](https://github.com/dscalzi).  

---

## Resources

* [Wiki][wiki]
* [Nebula (Create Distribution.json)][nebula]
---

### 👾 Determination 👾

[nodejs]: https://nodejs.org/en/ 'Node.js'
[vscode]: https://code.visualstudio.com/ 'Visual Studio Code'
[mainprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Main Process'
[rendererprocess]: https://electronjs.org/docs/tutorial/application-architecture#main-and-renderer-processes 'Renderer Process'
[chromedebugger]: https://marketplace.visualstudio.com/items?itemName=msjsdiag.debugger-for-chrome 'Debugger for Chrome'
[discord]: https://discord.gg/zNWUXdt 'Discord'
[wiki]: https://github.com/dscalzi/HeliosLauncher/wiki 'wiki'
[nebula]: https://github.com/dscalzi/Nebula 'dscalzi/Nebula'
