/**
 * Script for landing.ejs
 */
// Requirements
const { URL }                 = require('url')
const {
    MojangRestAPI,
    getServerStatus
}                             = require('helios-core/mojang')
const {
    RestResponseStatus,
    isDisplayableError,
    validateLocalFile
}                             = require('helios-core/common')
const {
    FullRepair,
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile
}                             = require('helios-core/dl')
const {
    validateSelectedJvm,
    ensureJavaDirIsRoot,
    javaExecFromRoot,
    discoverBestJvmInstallation,
    latestOpenJDK,
    extractJdk
}                             = require('helios-core/java')

// Internal Requirements
const DiscordWrapper          = require('./assets/js/discordwrapper')
const ProcessBuilder          = require('./assets/js/processbuilder')

// Launch Elements
const launch_content          = document.getElementById('launch_content')
const launch_details          = document.getElementById('launch_details')
const launch_progress         = document.getElementById('launch_progress')
const launch_progress_label   = document.getElementById('launch_progress_label')
const launch_details_text     = document.getElementById('launch_details_text')
const server_selection_button = document.getElementById('server_selection_button')
const user_text               = document.getElementById('user_text')

const loggerLanding = LoggerUtil.getLogger('Landing')

/* Launch Progress Wrapper Functions */

/**
 * Show/hide the loading area.
 * 
 * @param {boolean} loading True if the loading area should be shown, otherwise false.
 */
function toggleLaunchArea(loading){
    if(loading){
        launch_details.style.display = 'flex'
        launch_content.style.display = 'none'
    } else {
        launch_details.style.display = 'none'
        launch_content.style.display = 'inline-flex'
    }
}

/**
 * Set the details text of the loading area.
 * 
 * @param {string} details The new text for the loading details.
 */
function setLaunchDetails(details){
    launch_details_text.innerHTML = details
}

/**
 * Set the value of the loading progress bar and display that value.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setLaunchPercentage(percent){
    launch_progress.setAttribute('max', 100)
    launch_progress.setAttribute('value', percent)
    launch_progress_label.innerHTML = percent + '%'
}

/**
 * Set the value of the OS progress bar and display that on the UI.
 * 
 * @param {number} percent Percentage (0-100)
 */
function setDownloadPercentage(percent){
    remote.getCurrentWindow().setProgressBar(percent/100)
    setLaunchPercentage(percent)
}

/**
 * Enable or disable the launch button.
 * 
 * @param {boolean} val True to enable, false to disable.
 */
function setLaunchEnabled(val){
    document.getElementById('launch_button').disabled = !val
}

// Bind launch button
document.getElementById('launch_button').addEventListener('click', async e => {
    loggerLanding.info('Launching game..')
    try {
        const server = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())
        const jExe = ConfigManager.getJavaExecutable(ConfigManager.getSelectedServer())
        if(jExe == null){
            await asyncSystemScan(server.effectiveJavaOptions)
        } else {

            setLaunchDetails(Lang.queryJS('landing.launch.pleaseWait'))
            toggleLaunchArea(true)
            setLaunchPercentage(0, 100)

            const details = await validateSelectedJvm(ensureJavaDirIsRoot(jExe), server.effectiveJavaOptions.supported)
            if(details != null){
                loggerLanding.info('Jvm Details', details)
                await dlAsync()

            } else {
                await asyncSystemScan(server.effectiveJavaOptions)
            }
        }
    } catch(err) {
        loggerLanding.error('Unhandled error in during launch process.', err)
        showLaunchFailure(Lang.queryJS('landing.launch.failureTitle'), Lang.queryJS('landing.launch.failureText'))
    }
})

// Bind settings button
document.getElementById('configuracion').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings)
}

// Bind avatar overlay button.
document.getElementById('avatarOverlay').onclick = async e => {
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, () => {
        settingsNavItemListener(document.getElementById('settingsNavAccount'), false)
    })
}

// Bind selected account
function updateSelectedAccount(authUser){
    let username = Lang.queryJS('landing.selectedAccount.noAccountSelected')
    if(authUser != null){
        if(authUser.displayName != null){
            username = authUser.displayName
        }
        if(authUser.uuid != null){
            document.getElementById('avatarContainer').style.backgroundImage = `url('https://minotar.net/helm/${authUser.uuid}')`
        }
    }
    user_text.innerHTML = username
}
updateSelectedAccount(ConfigManager.getSelectedAccount())

// Bind selected server
function updateSelectedServer(serv){
    if(getCurrentView() === VIEWS.settings){
        fullSettingsSave()
    }
    ConfigManager.setSelectedServer(serv != null ? serv.rawServer.id : null)
    ConfigManager.save()
    server_selection_button.innerHTML = '&#8226; ' + (serv != null ? serv.rawServer.name : Lang.queryJS('landing.noSelection'))
    if(getCurrentView() === VIEWS.settings){
        animateSettingsTabRefresh()
    }
    setLaunchEnabled(serv != null)
}
// Real text is set in uibinder.js on distributionIndexDone.
server_selection_button.innerHTML = '&#8226; ' + Lang.queryJS('landing.selectedServer.loading')
server_selection_button.onclick = async e => {
    e.target.blur()
    await toggleServerSelection(true)
}

// Update Mojang Status Color
const refreshMojangStatuses = async function(){
    loggerLanding.info('Refreshing Mojang Statuses..')

    let status = 'grey'
    let tooltipEssentialHTML = ""
    let tooltipNonEssentialHTML = ""

    const response = await MojangRestAPI.status()
    let statuses
    if(response.responseStatus === RestResponseStatus.SUCCESS) {
        statuses = response.data
    } else {
        loggerLanding.warn('Unable to refresh Mojang service status.')
        statuses = MojangRestAPI.getDefaultStatuses()
    }
    
    greenCount = 0
    greyCount = 0

    for(let i=0; i<statuses.length; i++){
        const service = statuses[i]

        const tooltipHTML = `<div class="mojangStatusContainer">
            <span class="mojangStatusIcon" style="color: ${MojangRestAPI.statusToHex(service.status)};">&#8226;</span>
            <span class="mojangStatusName">${service.name}</span>
        </div>`
        if(service.essential){
            tooltipEssentialHTML += tooltipHTML
        } else {
            tooltipNonEssentialHTML += tooltipHTML
        }

        if(service.status === 'yellow' && status !== 'red'){
            status = 'yellow'
        } else if(service.status === 'red'){
            status = 'red'
        } else {
            if(service.status === 'grey'){
                ++greyCount
            }
            ++greenCount
        }

    }

    if(greenCount === statuses.length){
        if(greyCount === statuses.length){
            status = 'grey'
        } else {
            status = 'green'
        }
    }
    
    document.getElementById('mojangStatusEssentialContainer').innerHTML = tooltipEssentialHTML
    document.getElementById('mojangStatusNonEssentialContainer').innerHTML = tooltipNonEssentialHTML
    document.getElementById('mojang_status_icon').style.color = MojangRestAPI.statusToHex(status)
}

const refreshServerStatus = async (fade = false) => {
    loggerLanding.info('Refreshing Server Status')
    const serv = (await DistroAPI.getDistribution()).getServerById(ConfigManager.getSelectedServer())

    let pLabel = Lang.queryJS('landing.serverStatus.server')
    let pVal = Lang.queryJS('landing.serverStatus.offline')

    try {

        const servStat = await getServerStatus(47, serv.hostname, serv.port)
        console.log(servStat)
        pLabel = Lang.queryJS('landing.serverStatus.players')
        pVal = servStat.players.online + '/' + servStat.players.max

    } catch (err) {
        loggerLanding.warn('Unable to refresh server status, assuming offline.')
        loggerLanding.debug(err)
    }
    if(fade){
        $('#server_status_wrapper').fadeOut(250, () => {
            document.getElementById('landingPlayerLabel').innerHTML = pLabel
            document.getElementById('player_count').innerHTML = pVal
            $('#server_status_wrapper').fadeIn(500)
        })
    } else {
        document.getElementById('landingPlayerLabel').innerHTML = pLabel
        document.getElementById('player_count').innerHTML = pVal
    }
    
}

refreshMojangStatuses()
// Server Status is refreshed in uibinder.js on distributionIndexDone.

// Refresh statuses every hour. The status page itself refreshes every day so...
let mojangStatusListener = setInterval(() => refreshMojangStatuses(true), 60*60*1000)
// Set refresh rate to once every 5 minutes.
let serverStatusListener = setInterval(() => refreshServerStatus(true), 300000)

/**
 * Shows an error overlay, toggles off the launch area.
 * 
 * @param {string} title The overlay title.
 * @param {string} desc The overlay description.
 */
function showLaunchFailure(title, desc){
    setOverlayContent(
        title,
        desc,
        Lang.queryJS('landing.launch.okay')
    )
    setOverlayHandler(null)
    toggleOverlay(true)
    toggleLaunchArea(false)
}

/* System (Java) Scan */

/**
 * Asynchronously scan the system for valid Java installations.
 * 
 * @param {boolean} launchAfter Whether we should begin to launch after scanning. 
 */
async function asyncSystemScan(effectiveJavaOptions, launchAfter = true){

    setLaunchDetails(Lang.queryJS('landing.systemScan.checking'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const jvmDetails = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    )

    if(jvmDetails == null) {
        // If the result is null, no valid Java installation was found.
        // Show this information to the user.
        setOverlayContent(
            Lang.queryJS('landing.systemScan.noCompatibleJava'),
            Lang.queryJS('landing.systemScan.installJavaMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
            Lang.queryJS('landing.systemScan.installJava'),
            Lang.queryJS('landing.systemScan.installJavaManually')
        )
        setOverlayHandler(() => {
            setLaunchDetails(Lang.queryJS('landing.systemScan.javaDownloadPrepare'))
            toggleOverlay(false)
            
            try {
                downloadJava(effectiveJavaOptions, launchAfter)
            } catch(err) {
                loggerLanding.error('Unhandled error in Java Download', err)
                showLaunchFailure(Lang.queryJS('landing.systemScan.javaDownloadFailureTitle'), Lang.queryJS('landing.systemScan.javaDownloadFailureText'))
            }
        })
        setDismissHandler(() => {
            $('#overlayContent').fadeOut(250, () => {
                //$('#overlayDismiss').toggle(false)
                setOverlayContent(
                    Lang.queryJS('landing.systemScan.javaRequired', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredMessage', { 'major': effectiveJavaOptions.suggestedMajor }),
                    Lang.queryJS('landing.systemScan.javaRequiredDismiss'),
                    Lang.queryJS('landing.systemScan.javaRequiredCancel')
                )
                setOverlayHandler(() => {
                    toggleLaunchArea(false)
                    toggleOverlay(false)
                })
                setDismissHandler(() => {
                    toggleOverlay(false, true)

                    asyncSystemScan(effectiveJavaOptions, launchAfter)
                })
                $('#overlayContent').fadeIn(250)
            })
        })
        toggleOverlay(true, true)
    } else {
        // Java installation found, use this to launch the game.
        const javaExec = javaExecFromRoot(jvmDetails.path)
        ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), javaExec)
        ConfigManager.save()

        // We need to make sure that the updated value is on the settings UI.
        // Just incase the settings UI is already open.
        settingsJavaExecVal.value = javaExec
        await populateJavaExecDetails(settingsJavaExecVal.value)

        // TODO Callback hell, refactor
        // TODO Move this out, separate concerns.
        if(launchAfter){
            await dlAsync()
        }
    }

}

async function downloadJava(effectiveJavaOptions, launchAfter = true) {

    // TODO Error handling.
    // asset can be null.
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution)

    if(asset == null) {
        throw new Error(Lang.queryJS('landing.downloadJava.findJdkFailure'))
    }

    let received = 0
    await downloadFile(asset.url, asset.path, ({ transferred }) => {
        received = transferred
        setDownloadPercentage(Math.trunc((transferred/asset.size)*100))
    })
    setDownloadPercentage(100)

    if(received != asset.size) {
        loggerLanding.warn(`Java Download: Expected ${asset.size} bytes but received ${received}`)
        if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
            log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
            // Don't know how this could happen, but report it.
            throw new Error(Lang.queryJS('landing.downloadJava.javaDownloadCorruptedError'))
        }
    }

    // Extract
    // Show installing progress bar.
    remote.getCurrentWindow().setProgressBar(2)

    // Wait for extration to complete.
    const eLStr = Lang.queryJS('landing.downloadJava.extractingJava')
    let dotStr = ""
    setLaunchDetails(eLStr)
    const extractListener = setInterval(() => {
        if(dotStr.length >= 3){
            dotStr = ""
        } else {
            dotStr += '.'
        }
        setLaunchDetails(eLStr + dotStr)
    }, 750)

    const newJavaExec = await extractJdk(asset.path)

    // Extraction complete, remove the loading from the OS progress bar.
    remote.getCurrentWindow().setProgressBar(-1)

    // Extraction completed successfully.
    ConfigManager.setJavaExecutable(ConfigManager.getSelectedServer(), newJavaExec)
    ConfigManager.save()

    clearInterval(extractListener)
    setLaunchDetails(Lang.queryJS('landing.downloadJava.javaInstalled'))

    // TODO Callback hell
    // Refactor the launch functions
    asyncSystemScan(effectiveJavaOptions, launchAfter)

}

// Keep reference to Minecraft Process
let proc
// Is DiscordRPC enabled
let hasRPC = false
// Joined server regex
// Change this if your server uses something different.
const GAME_JOINED_REGEX = /\[.+\]: Sound engine started/
const GAME_LAUNCH_REGEX = /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/
const MIN_LINGER = 5000

async function dlAsync(login = true) {

    // Login parameter is temporary for debug purposes. Allows testing the validation/downloads without
    // launching the game.

    const loggerLaunchSuite = LoggerUtil.getLogger('LaunchSuite')

    setLaunchDetails(Lang.queryJS('landing.dlAsync.loadingServerInfo'))

    let distro

    try {
        distro = await DistroAPI.refreshDistributionOrFallback()
        onDistroRefresh(distro)
    } catch(err) {
        loggerLaunchSuite.error('Unable to refresh distribution index.', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.fatalError'), Lang.queryJS('landing.dlAsync.unableToLoadDistributionIndex'))
        return
    }

    const serv = distro.getServerById(ConfigManager.getSelectedServer())

    if(login) {
        if(ConfigManager.getSelectedAccount() == null){
            loggerLanding.error('You must be logged into an account.')
            return
        }
    }

    setLaunchDetails(Lang.queryJS('landing.dlAsync.pleaseWait'))
    toggleLaunchArea(true)
    setLaunchPercentage(0, 100)

    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer(),
        DistroAPI.isDevMode()
    )

    fullRepairModule.spawnReceiver()

    fullRepairModule.childProcess.on('error', (err) => {
        loggerLaunchSuite.error('Error during launch', err)
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), err.message || Lang.queryJS('landing.dlAsync.errorDuringLaunchText'))
    })
    fullRepairModule.childProcess.on('close', (code, _signal) => {
        if(code !== 0){
            loggerLaunchSuite.error(`Full Repair Module exited with code ${code}, assuming error.`)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        }
    })

    loggerLaunchSuite.info('Validating files.')
    setLaunchDetails(Lang.queryJS('landing.dlAsync.validatingFileIntegrity'))
    let invalidFileCount = 0
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(percent => {
            setLaunchPercentage(percent)
        })
        setLaunchPercentage(100)
    } catch (err) {
        loggerLaunchSuite.error('Error during file validation.')
        showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileVerificationTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
        return
    }
    

    if(invalidFileCount > 0) {
        loggerLaunchSuite.info('Downloading files.')
        setLaunchDetails(Lang.queryJS('landing.dlAsync.downloadingFiles'))
        setLaunchPercentage(0)
        try {
            await fullRepairModule.download(percent => {
                setDownloadPercentage(percent)
            })
            setDownloadPercentage(100)
        } catch(err) {
            loggerLaunchSuite.error('Error during file download.')
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringFileDownloadTitle'), err.displayable || Lang.queryJS('landing.dlAsync.seeConsoleForDetails'))
            return
        }
    } else {
        loggerLaunchSuite.info('No invalid files, skipping download.')
    }

    // Remove download bar.
    remote.getCurrentWindow().setProgressBar(-1)

    fullRepairModule.destroyReceiver()

    setLaunchDetails(Lang.queryJS('landing.dlAsync.preparingToLaunch'))

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion)
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    )

    const modLoaderData = await distributionIndexProcessor.loadModLoaderVersionJson(serv)
    const versionData = await mojangIndexProcessor.getVersionJson()

    if(login) {
        const authUser = ConfigManager.getSelectedAccount()
        loggerLaunchSuite.info(`Sending selected account (${authUser.displayName}) to ProcessBuilder.`)
        let pb = new ProcessBuilder(serv, versionData, modLoaderData, authUser, remote.app.getVersion())
        setLaunchDetails(Lang.queryJS('landing.dlAsync.launchingGame'))

        // const SERVER_JOINED_REGEX = /\[.+\]: \[CHAT\] [a-zA-Z0-9_]{1,16} joined the game/
        const SERVER_JOINED_REGEX = new RegExp(`\\[.+\\]: \\[CHAT\\] ${authUser.displayName} joined the game`)

        const onLoadComplete = () => {
            toggleLaunchArea(false)
            if(hasRPC){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.loading'))
                proc.stdout.on('data', gameStateChange)
            }
            proc.stdout.removeListener('data', tempListener)
            proc.stderr.removeListener('data', gameErrorListener)
        }
        const start = Date.now()

        // Attach a temporary listener to the client output.
        // Will wait for a certain bit of text meaning that
        // the client application has started, and we can hide
        // the progress bar stuff.
        const tempListener = function(data){
            if(GAME_LAUNCH_REGEX.test(data.trim())){
                const diff = Date.now()-start
                if(diff < MIN_LINGER) {
                    setTimeout(onLoadComplete, MIN_LINGER-diff)
                } else {
                    onLoadComplete()
                }
            }
        }

        // Listener for Discord RPC.
        const gameStateChange = function(data){
            data = data.trim()
            if(SERVER_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joined'))
            } else if(GAME_JOINED_REGEX.test(data)){
                DiscordWrapper.updateDetails(Lang.queryJS('landing.discord.joining'))
            }
        }

        const gameErrorListener = function(data){
            data = data.trim()
            if(data.indexOf('Could not find or load main class net.minecraft.launchwrapper.Launch') > -1){
                loggerLaunchSuite.error('Game launch failed, LaunchWrapper was not downloaded properly.')
                showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.launchWrapperNotDownloaded'))
            }
        }

        try {
            // Build Minecraft process.
            proc = pb.build()

            // Bind listeners to stdout.
            proc.stdout.on('data', tempListener)
            proc.stderr.on('data', gameErrorListener)

            setLaunchDetails(Lang.queryJS('landing.dlAsync.doneEnjoyServer'))

            // Init Discord Hook
            if(distro.rawDistribution.discord != null && serv.rawServer.discord != null){
                DiscordWrapper.initRPC(distro.rawDistribution.discord, serv.rawServer.discord)
                hasRPC = true
                proc.on('close', (code, signal) => {
                    loggerLaunchSuite.info('Shutting down Discord Rich Presence..')
                    DiscordWrapper.shutdownRPC()
                    hasRPC = false
                    proc = null
                })
            }

        } catch(err) {

            loggerLaunchSuite.error('Error during launch', err)
            showLaunchFailure(Lang.queryJS('landing.dlAsync.errorDuringLaunchTitle'), Lang.queryJS('landing.dlAsync.checkConsoleForDetails'))

        }
    }

}

/**
 * News Loading Functions
 */

// DOM Cache
const newsContent                   = document.getElementById('newsContent')
const newsArticleTitle              = document.getElementById('newsArticleTitle')
const newsArticleDate               = document.getElementById('newsArticleDate')
const newsArticleAuthor             = document.getElementById('newsArticleAuthor')
const newsArticleComments           = document.getElementById('newsArticleComments')
const newsNavigationStatus          = document.getElementById('newsNavigationStatus')
const newsArticleContentScrollable  = document.getElementById('newsArticleContentScrollable')
const nELoadSpan                    = document.getElementById('nELoadSpan')

// News slide caches.
let newsActive = false
let newsGlideCount = 0

/**
 * Show the news UI via a slide animation.
 * 
 * @param {boolean} up True to slide up, otherwise false. 
 */
function slide_(up){
    const lCUpper = document.querySelector('#landingContainer > #upper')
    const lCLLeft = document.querySelector('#landingContainer > #lower > #left')
    const lCLCenter = document.querySelector('#landingContainer > #lower > #center')
    const lCLRight = document.querySelector('#landingContainer > #lower > #right')
    const newsBtn = document.querySelector('#landingContainer > #lower > #center #content')
    const landingContainer = document.getElementById('landingContainer')
    const newsContainer = document.querySelector('#landingContainer > #newsContainer')

    newsGlideCount++

    if(up){
        lCUpper.style.top = '-200vh'
        lCLLeft.style.top = '-200vh'
        lCLCenter.style.top = '-200vh'
        lCLRight.style.top = '-200vh'
        newsBtn.style.top = '130vh'
        newsContainer.style.top = '0px'
        //date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})
        //landingContainer.style.background = 'rgba(29, 29, 29, 0.55)'
        landingContainer.style.background = 'rgba(0, 0, 0, 0.50)'
        setTimeout(() => {
            if(newsGlideCount === 1){
                lCLCenter.style.transition = 'none'
                newsBtn.style.transition = 'none'
            }
            newsGlideCount--
        }, 2000)
    } else {
        setTimeout(() => {
            newsGlideCount--
        }, 2000)
        landingContainer.style.background = null
        lCLCenter.style.transition = null
        newsBtn.style.transition = null
        newsContainer.style.top = '100%'
        lCUpper.style.top = '0px'
        lCLLeft.style.top = '0px'
        lCLCenter.style.top = '0px'
        lCLRight.style.top = '0px'
        newsBtn.style.top = '10px'
    }
}

// Cerramos noticias.
document.getElementById('cerrarnews').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Bind news button.
document.getElementById('news').onclick = () => {
    // Toggle tabbing.
    if(newsActive){
        $('#landingContainer *').removeAttr('tabindex')
        $('#newsContainer *').attr('tabindex', '-1')
    } else {
        $('#landingContainer *').attr('tabindex', '-1')
        $('#newsContainer, #newsContainer *, #lower, #lower #center *').removeAttr('tabindex')
        if(newsAlertShown){
            $('#newsButtonAlert').fadeOut(2000)
            newsAlertShown = false
            ConfigManager.setNewsCacheDismissed(true)
            ConfigManager.save()
        }
    }
    slide_(!newsActive)
    newsActive = !newsActive
}

// Array to store article meta.
let newsArr = null

// News load animation listener.
let newsLoadingListener = null

/**
 * Set the news loading animation.
 * 
 * @param {boolean} val True to set loading animation, otherwise false.
 */
function setNewsLoading(val){
    if(val){
        const nLStr = Lang.queryJS('landing.news.checking')
        let dotStr = '..'
        nELoadSpan.innerHTML = nLStr + dotStr
        newsLoadingListener = setInterval(() => {
            if(dotStr.length >= 3){
                dotStr = ""
            } else {
                dotStr += '.'
            }
            nELoadSpan.innerHTML = nLStr + dotStr
        }, 750)
    } else {
        if(newsLoadingListener != null){
            clearInterval(newsLoadingListener)
            newsLoadingListener = null
        }
    }
}

// Bind retry button.
newsErrorRetry.onclick = () => {
    $('#newsErrorFailed').fadeOut(250, () => {
        initNews()
        $('#newsErrorLoading').fadeIn(250)
    })
}

newsArticleContentScrollable.onscroll = (e) => {
    if(e.target.scrollTop > Number.parseFloat($('.newsArticleSpacerTop').css('height'))){
        newsContent.setAttribute('scrolled', "")
    } else {
        newsContent.removeAttribute('scrolled')
    }
}

/**
 * Reload the news without restarting.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
function reloadNews(){
    return new Promise((resolve, reject) => {
        $('#newsContent').fadeOut(250, () => {
            $('#newsErrorLoading').fadeIn(250)
            initNews().then(() => {
                resolve()
            })
        })
    })
}

let newsAlertShown = false

/**
 * Show the news alert indicating there is new news.
 */
function showNewsAlert(){
    newsAlertShown = true
    $(newsButtonAlert).fadeIn(250)
}

async function digestMessage(str) {
    const msgUint8 = new TextEncoder().encode(str)
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join("")
    return hashHex
}

/**
 * Initialize News UI. This will load the news and prepare
 * the UI accordingly.
 * 
 * @returns {Promise.<void>} A promise which resolves when the news
 * content has finished loading and transitioning.
 */
async function initNews(){

    setNewsLoading(true)

    const news = await loadNews()

    newsArr = news?.articles || null

    if(newsArr == null){
        // News Loading Failed
        setNewsLoading(false)

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorFailed').fadeIn(250).promise()

    } else if(newsArr.length === 0) {
        // No News Articles
        setNewsLoading(false)

        ConfigManager.setNewsCache({
            date: null,
            content: null,
            dismissed: false
        })
        ConfigManager.save()

        await $('#newsErrorLoading').fadeOut(250).promise()
        await $('#newsErrorNone').fadeIn(250).promise()
    } else {
        // Success
        setNewsLoading(false)

        const lN = newsArr[0]
        const cached = ConfigManager.getNewsCache()
        let newHash = await digestMessage(lN.content)
        let newDate = new Date(lN.date)
        let isNew = false

        if(cached.date != null && cached.content != null){

            if(new Date(cached.date) >= newDate){

                // Compare Content
                if(cached.content !== newHash){
                    isNew = true
                    showNewsAlert()
                } else {
                    if(!cached.dismissed){
                        isNew = true
                        showNewsAlert()
                    }
                }

            } else {
                isNew = true
                showNewsAlert()
            }

        } else {
            isNew = true
            showNewsAlert()
        }

        if(isNew){
            ConfigManager.setNewsCache({
                date: newDate.getTime(),
                content: newHash,
                dismissed: false
            })
            ConfigManager.save()
        }

        const switchHandler = (forward) => {
            let cArt = parseInt(newsContent.getAttribute('article'))
            let nxtArt = forward ? (cArt >= newsArr.length-1 ? 0 : cArt + 1) : (cArt <= 0 ? newsArr.length-1 : cArt - 1)
    
            displayArticle(newsArr[nxtArt], nxtArt+1)
        }

        document.getElementById('newsNavigateRight').onclick = () => { switchHandler(true) }
        document.getElementById('newsNavigateLeft').onclick = () => { switchHandler(false) }
        await $('#newsErrorContainer').fadeOut(250).promise()
        displayArticle(newsArr[0], 1)
        await $('#newsContent').fadeIn(250).promise()
    }


}

/**
 * Add keyboard controls to the news UI. Left and right arrows toggle
 * between articles. If you are on the landing page, the up arrow will
 * open the news UI.
 */
document.addEventListener('keydown', (e) => {
    if(newsActive){
        if(e.key === 'ArrowRight' || e.key === 'ArrowLeft'){
            document.getElementById(e.key === 'ArrowRight' ? 'newsNavigateRight' : 'newsNavigateLeft').click()
        }
        // Interferes with scrolling an article using the down arrow.
        // Not sure of a straight forward solution at this point.
        // if(e.key === 'ArrowDown'){
        //     document.getElementById('newsButton').click()
        // }
    } else {
        if(getCurrentView() === VIEWS.landing){
            if(e.key === 'ArrowUp'){
                document.getElementById('newsButton').click()
            }
        }
    }
})

/**
 * Display a news article on the UI.
 * 
 * @param {Object} articleObject The article meta object.
 * @param {number} index The article index.
 */
function displayArticle(articleObject, index){
    newsArticleTitle.innerHTML = articleObject.title
    newsArticleTitle.href = articleObject.link
    newsArticleAuthor.innerHTML = 'by ' + articleObject.author
    newsArticleDate.innerHTML = articleObject.date
    newsArticleComments.innerHTML = articleObject.comments
    newsArticleComments.href = articleObject.commentsLink
    newsArticleContentScrollable.innerHTML = '<div id="newsArticleContentWrapper"><div class="newsArticleSpacerTop"></div>' + articleObject.content + '<div class="newsArticleSpacerBot"></div></div>'
    Array.from(newsArticleContentScrollable.getElementsByClassName('bbCodeSpoilerButton')).forEach(v => {
        v.onclick = () => {
            const text = v.parentElement.getElementsByClassName('bbCodeSpoilerText')[0]
            text.style.display = text.style.display === 'block' ? 'none' : 'block'
        }
    })
    newsNavigationStatus.innerHTML = Lang.query('ejs.landing.newsNavigationStatus', {currentPage: index, totalPages: newsArr.length})
    newsContent.setAttribute('article', index-1)
}

/**
 * Load news information from the RSS feed specified in the
 * distribution index.
 */
async function loadNews(){

    const distroData = await DistroAPI.getDistribution()
    if(!distroData.rawDistribution.rss) {
        loggerLanding.debug('No RSS feed provided.')
        return null
    }

    const promise = new Promise((resolve, reject) => {
        
        const newsFeed = distroData.rawDistribution.rss
        const newsHost = new URL(newsFeed).origin + '/'
        $.ajax({
            url: newsFeed,
            success: (data) => {
                const items = $(data).find('item')
                const articles = []

                for(let i=0; i<items.length; i++){
                // JQuery Element
                    const el = $(items[i])

                    // Resolve date.
                    const date = new Date(el.find('pubDate').text()).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric'})

                    // Resolve comments.
                    let comments = el.find('slash\\:comments').text() || '0'
                    comments = comments + ' Comment' + (comments === '1' ? "" : 's')

                    // Fix relative links in content.
                    let content = el.find('content\\:encoded').text()
                    let regex = /src="(?!http:\/\/|https:\/\/)(.+?)"/g
                    let matches
                    while((matches = regex.exec(content))){
                        content = content.replace(`"${matches[1]}"`, `"${newsHost + matches[1]}"`)
                    }

                    let link   = el.find('link').text()
                    let title  = el.find('title').text()
                    let author = el.find('dc\\:creator').text()

                    // Generate article.
                    articles.push(
                        {
                            link,
                            title,
                            date,
                            author,
                            content,
                            comments,
                            commentsLink: link + '#comments'
                        }
                    )
                }
                resolve({
                    articles
                })
            },
            timeout: 2500
        }).catch(err => {
            resolve({
                articles: null
            })
        })
    })

    return await promise
}

//VIDEOS PARA LA SECCION DE CANCIONES
let previousVideo = null;
let currentIndex = -1;  // Índice del video actual
const videoElement = document.getElementById('randomVideo');
const descripcionElement = document.getElementById('descripcion');
const videoCounterElement = document.getElementById('videoCounter');
const canvasElement = document.getElementById('audioSpectrum');
const canvasCtx = canvasElement.getContext('2d');
let isPaused = JSON.parse(localStorage.getItem('isPaused')) === true;

const videos = [
    { src: 'https://launcheryokai.web.app/music2.mp4', description: 'EVERYBODY WANTS TO RULE THE WORLD\nTears for Fears' },
    { src: 'https://launcheryokai.web.app/music3.mp4', description: 'I RAN SO FAR AWAY' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Raindrops%20Keep%20Falling%20on%20my%20Head%20-%20B.J.%20Thomas.mp4?alt=media&token=9d8090bc-8744-4045-bafa-f4528a842805', description: 'RAINDROPS KEEP FALLING ON MY HEAD\nB.J. Thomas' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/The%20Rolling%20Stones%20-%20Doom%20And%20Gloom.mp4?alt=media&token=63232548-10db-408d-9193-2ef5f4ae65c7", description: 'DOOM AND GLOOM\nThe Rolling Stones' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Dire%20Straits%20-%20Money%20For%20Nothing.mp4?alt=media&token=ab50872f-3a76-47ca-8a44-54b774454bd0", description: 'MONEY FOR NOTHING\nDire Straits' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Lenny%20Kravitz%20-%20It%20Ain't%20Over%20'Til%20It's%20Over.mp4?alt=media&token=936b769b-e4b7-4aec-8b8a-4defbca1afaa", description: "IT AIN'T OVER 'TIL IT'S OVER\nLenny Kravitz" },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Empire%20Of%20The%20Sun%20%20-%20Way%20To%20Go.mp4?alt=media&token=d3ca5000-4927-4563-96f7-daf4c942d2ec', description: 'WAY TO GO\nEmpire Of The Sun' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Over%20the%20Rainbow%20-%20Israel%20Kamakawiwoole.mp4?alt=media&token=3483ff71-9472-4171-a4a2-e1a8ccb74ff5", description: 'OVER THE RAINBOW\nIsrael Kamakawiwo\'ole' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Take%20Me%20Home%20Tonight%20-%20Eddie%20Money.mp4?alt=media&token=b88b9e76-7b91-43d5-b6ef-c7aa5f59121a", description: 'TAKE ME HOME TONIGHT\nEddie Money' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Bon%20Jovi%20-%20Livin%20On%20A%20Prayer.mp4?alt=media&token=892922d0-f8f3-4fa3-a237-fa6d440573dc", description: 'LIVIN\' ON A PRAYER\nBon Jovi' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Grease%20-%20You're%20The%20One%20That%20I%20Want%20.mp4?alt=media&token=5f5d9568-7eb6-437e-a34c-c36c04605985", description: "YOU'RE THE ONE THAT I WANT\nGrease" },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Billy%20Idol%20-%20Dancing%20With%20Myself.mp4?alt=media&token=1ed83b59-aa37-4108-8169-ec66af37d253", description: 'DANCING WITH MYSELF\nBilly Idol' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/The%20Spins%20-%20Mac%20Miller.mp4?alt=media&token=2ad8b9cf-f15d-4d91-a898-09336e2fbcd2", description: 'THE SPINS\nMac Miller' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/KOMM%2C%20SUSSER%20TOD%20M-10%20Director's%20Edit%20Version%20%20Evangelion%20Finally%20-%20Milan%20Records%20USA.mp4?alt=media&token=69e9da16-a21d-4181-bccf-8cd7a09c0b4d", description: 'KOMM, SUSSER TOD (DIRECTOR\'S EDIT VERSION)\nEvangelion Finally - Milan Records USA' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Spacehog%20-%20In%20the%20Meantime.mp4?alt=media&token=8a515100-d931-49ad-8618-f027a11f51e2", description: 'IN THE MEANTIME\nSpacehog' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/The%20Power%20Of%20Love-%20Huey%20Lewis.mp4?alt=media&token=19aec9f0-3021-4202-9728-c1b39abda010", description: 'THE POWER OF LOVE\nHuey Lewis' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Sky%20Ferreira%20-%20Easy.mp4?alt=media&token=e8916c98-a738-4aa7-827b-afb598391c04", description: 'EASY\nSky Ferreira' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/%D0%A8%D1%83%D1%80%D0%B0%20-%20%D0%A2%D1%8B%20%D0%BD%D0%B5%20%D0%B2%D0%B5%D1%80%D1%8C%20%D1%81%D0%BB%D0%B5%D0%B7%D0%B0%D0%BC%20-%20%D0%9C%D0%B8%D1%81%D1%82%D0%B5%D1%80%20%D0%90%D1%80%D0%BC%D0%B5%D0%BD%D0%B8%D1%8F.mp4?alt=media&token=11638459-6525-499e-a698-fd2ddfa612eb", description: 'ТЫ НЕ ВЕРЬ СЛЕЗАМ\nШура' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Mr.%20Blue%20Sky%20-%20Electric%20Light%20Orchestra%20.mp4?alt=media&token=4a2328fe-cf71-41ec-aa70-aa04d1937796", description: 'MR. BLUE SKY\nElectric Light Orchestra' },
    { src: "https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Bob%20Marley%20-%20Don't%20worry%20be%20Happy.mp4?alt=media&token=565a44e4-b8c2-4058-b893-dc0cc13aa033", description: "DON'T WORRY BE HAPPY\nBob Marley" },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music4.mp4?alt=media&token=89354eda-867d-4ae0-aa05-28d66ab612c9', description: 'White Wedding, Pt. 1\nBilly Idol'},
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music5.mp4?alt=media&token=991a68d8-7014-4a33-bd27-a14ae2adfcb1', description: 'The Break up Song\nThe Greg Kihn Band' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music6.mp4?alt=media&token=cb86e1b2-0fb6-4099-9a54-ae09a1682632', description: 'Creep (Acoustic)\nRadiohead' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music7.mp4?alt=media&token=fe5643c5-d004-4daa-9f02-452bbd0d0dfc', description: 'Fooled Around and Fell in Love\nElvin Bishop' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music8.mp4?alt=media&token=327cdfd5-191e-48e5-8730-40c455a9a93b', description: 'Take On Me\na-ha' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music9.mp4?alt=media&token=d9e7cc1d-6754-43f0-9acb-21af37fb670b', description: 'Dont Fear The Reaper\nBlue Öyster Cult' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music10.mp4?alt=media&token=d30bc557-aca1-4ec6-966f-2d0a36d27efc', description: 'Kickstart My Heart\nMötley Crüe' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music11.mp4?alt=media&token=1052999a-8d08-478c-a443-427d045f3f63', description: 'Stella Stai\nUmberto Tozzi' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music12.mp4?alt=media&token=f68bd35b-bf6f-4795-af4f-51dd98d46639', description: 'We Built This City\nStarship' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/launcheryokai.appspot.com/o/music13.mp4?alt=media&token=db480ecb-7e02-4d5a-922f-b3693d96ad85', description: 'People Get Up And Drive Your Funky Soul\nJames Brown' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music14.mp4?alt=media&token=7b8cea1a-2d2f-4e8c-8263-2fe1817a3a8c', description: 'Your Love\nThe Outfield' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music15.mp4?alt=media&token=770b6e26-b15e-408b-b923-f2615ac30836', description: 'Un show más\nGary' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music16.mp4?alt=media&token=d1331389-128b-4d48-958a-475a2b499157', description: 'Mona Lisa\nDominic Fike' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music17.mp4?alt=media&token=90f6a5db-aa1a-4ba3-87c2-8d85f7c74361', description: 'Blue (Da Ba Dee)\n[Gabry Ponte Video Edit]  Eiffel 65' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music18.mp4?alt=media&token=a52614d0-a2d7-43cb-b248-ec2c891a2c36', description: 'DotA (Radio Edit)\nBasshunter' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music19.mp4?alt=media&token=1bd1a1e7-6f7b-4397-87fc-cc457ed66a63', description: 'Pumped Up Kicks\nFoster the People' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music20.mp4?alt=media&token=7bcbf513-f23e-42c2-abf2-63d34e8758fd', description: 'Funkytown\nLipps, Inc.' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokaihardcoreoficial.appspot.com/o/Since%20You%20Been%20Gone%20-%20Rainbow%20(720p%2C%20h264%2C%20youtube).mp4?alt=media&token=9246b57c-e718-459b-abdc-ffc287c7212a', description: 'SINCE YOU BEEN GONE\nRainbow' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music21.mp4?alt=media&token=18b0bc6b-a92a-41f6-990c-f9d8f1da1ae4', description: 'Boom, Boom, Boom, Boom!\nVengaboys' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music22.mp4?alt=media&token=55d651fe-e664-42ad-b005-2408f6414752', description: 'Born to Be Alive (Mix 79)\nPatrick Hernandez' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music23.mp4?alt=media&token=806105b5-6f25-42a2-ac11-2c00394d9ba8', description: 'Stayin Alive\nBee Gees' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music24.mp4?alt=media&token=b10b4bf8-115c-46b5-af5a-990cffe39109', description: 'Sunflower\nPost Malone & Swae Lee' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music25.mp4?alt=media&token=fa321af3-1768-4ed5-9b35-5881bf93256e', description: 'Alright\nSupergrass' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music26.mp4?alt=media&token=373107f3-49ba-4d1c-ac9d-9eade6f5d12b', description: 'Working for the Weekend\nLoverboy' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music27.mp4?alt=media&token=ba36a9ec-3eea-4d6c-bf43-12a3c2c44815', description: 'Hangin Tough\nNew Kids On the Block' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music28.mp4?alt=media&token=6a501a90-f833-4ecd-a307-462194325dc3', description: 'Everything in You (feat. Half Shy)\nAdventure Time' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music29.mp4?alt=media&token=c7c3a6f9-eb81-422f-add9-0b55049f9554', description: 'Part of the Madness (feat. Rebecca Sugar)\nAdventure Time' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music30.mp4?alt=media&token=3bee9467-997e-4430-8b55-b084144c152c', description: 'Wake Me Up Before You Go-Go\nWham!' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music31.mp4?alt=media&token=592f051e-772c-4351-9cb4-f73be1c79aef', description: 'Last Chrismatsu\nWham' },
    { src: 'https://firebasestorage.googleapis.com/v0/b/yokai888-ca372.appspot.com/o/music32.mp4?alt=media&token=cef9ae96-29f8-4406-8b3c-03de4891ec4f', description: 'Cant Smile Without You\nBarry Manilow' },
];
function getRandomVideo() {
    let randomIndex;
    do {
        randomIndex = Math.floor(Math.random() * videos.length);
    } while (videos[randomIndex] === previousVideo && videos.length > 1);
    previousVideo = videos[randomIndex];
    return randomIndex;
}

function loadVideo(index) {
    if (index < 0 || index >= videos.length) return;
    currentIndex = index;
    const video = videos[currentIndex];
    videoElement.src = video.src;
    descripcionElement.innerHTML = video.description.replace(/\n/g, "<br>");
    videoElement.load();
    if (!isPaused) {
        videoElement.play();
    }
    updateCounter();
}

function updateCounter() {
    videoCounterElement.textContent = `Video ${currentIndex + 1} de ${videos.length}`;
}

document.getElementById('prevButton').addEventListener('click', function() {
    const prevIndex = (currentIndex - 1 + videos.length) % videos.length;
    loadVideo(prevIndex);
});

document.getElementById('nextButton').addEventListener('click', function() {
    const nextIndex = getRandomVideo();
    loadVideo(nextIndex);
});

videoElement.addEventListener('ended', function() {
    const nextIndex = getRandomVideo();
    loadVideo(nextIndex);
});

videoElement.addEventListener('pause', function() {
    isPaused = true;
    localStorage.setItem('isPaused', true);
});

videoElement.addEventListener('play', function() {
    isPaused = false;
    localStorage.setItem('isPaused', false);
});

function setupAudioAnalysis() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(videoElement);
    const analyser = audioCtx.createAnalyser();
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        analyser.getByteFrequencyData(dataArray);
        const barWidth = (canvasElement.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 3;
            canvasCtx.fillStyle = '#5d02fc';
            canvasCtx.fillRect(x, canvasElement.height - barHeight / 2, barWidth, barHeight);
            x += barWidth + 1;
        }
        requestAnimationFrame(draw);
    }
    draw();
}

window.onload = function() {
    setupAudioAnalysis();
    loadVideo(getRandomVideo());  // Cargar el primer video aleatorio al inicio
    
    if (isPaused) {
        videoElement.pause();
    }
};
// Botón que abre las canciones.
document.getElementById('song').onclick = () => {
    // Ocultar otros elementos de landingContainer con animación de fundido.
    $('#landingContainer > *:not(#canciones)').fadeOut('slow', function() {
        // Una vez que los elementos de landingContainer se ocultan, mostrar canciones con fundido.
        $('#canciones').fadeIn('slow');
    });
};

// Botón que cierra las canciones.
document.getElementById('cerrarsong').addEventListener('click', function() {
    // Ocultar canciones con animación de fundido.
    $('#canciones').fadeOut('slow', function() {
        // Una vez que las canciones se han ocultado, mostrar de nuevo los elementos de landingContainer con fundido.
        $('#landingContainer > *:not(#canciones)').fadeIn('slow');
    });
});

//Creditos y noticias.
document.addEventListener("DOMContentLoaded", function() {
    const iframeNoticias = document.getElementById("iframeNoticias");
    const iframeCreditos = document.getElementById("iframeCreditos");
    const toggleButton = document.getElementById("toggleCreditos");
    const socialMediaContainer = document.getElementById("socialMedia");  // Contenedor de redes sociales

    // Función para mostrar un iframe con animación de entrada
    function showIframe(iframeToShow, iframeToHide) {
        iframeToHide.classList.add("hidden"); // Aplicar animación de salida

        setTimeout(function() {
            iframeToHide.style.display = "none"; // Ocultar el iframe de salida

            iframeToShow.style.display = "block"; // Mostrar el iframe de entrada
            void iframeToShow.offsetWidth; // Forzar reflujo/repaint para la animación
            iframeToShow.classList.remove("hidden"); // Aplicar animación de entrada
        }, 1000); // Duración de la animación de salida
    }

    // Función para cambiar a Créditos
    function showCreditos() {
        showIframe(iframeCreditos, iframeNoticias);
        toggleButton.innerText = "Noticias"; // Cambiar el texto del botón

        // Ocultamos el contenedor de redes sociales con animación de salida
        socialMediaContainer.classList.add("hidden");
        socialMediaContainer.classList.remove("visible"); // Aseguramos que no esté visible
    }

    // Función para cambiar a Noticias
    function showNoticias() {
        showIframe(iframeNoticias, iframeCreditos);
        toggleButton.innerText = "Créditos"; // Cambiar el texto del botón

        // Aseguramos que el contenedor de redes sociales se vuelve visible con animación de entrada
        void socialMediaContainer.offsetWidth; // Forzamos un reflujo para reiniciar la animación
        socialMediaContainer.classList.add("visible"); // Aplicamos la clase de visibilidad con animación
    }

    // Asignar el evento click al botón
    toggleButton.addEventListener("click", function() {
        if (toggleButton.innerText === "Créditos") {
            showCreditos();
        } else {
            showNoticias();
        }
    });
});
//Siempre nuevos
    function addUniqueParam(url) {
        return url + '?v=' + new Date().getTime();
    }

    // Asignar URLs con parámetros únicos a los iframes
    document.getElementById('iframeNoticias').src = addUniqueParam('https://kurojs.github.io/AssetHub/files/index.html');
    document.getElementById('iframeCreditos').src = addUniqueParam('https://creditos-ade2a.web.app/nuevo.html');