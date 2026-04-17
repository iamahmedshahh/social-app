# Android Build Guide

This guide covers how to build the Bluesky Social app for Android locally on an Ubuntu/Debian development machine.

---

## Prerequisites Installation (Developer chosen settings)

### 1. Node.js (>= 20) 20 Above works

Install via NVM 


### 2. Yarn Classic

```bash

from package.json

  "packageManager": "yarn@1.22.22",

npm install -g corepack


```

### 3. USED on Java 17 you can use newer versions

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk   

# Verify or Print your version if above 17
java -version 
```

If you have multiple Java versions installed, set Java 17 as default:

```bash
sudo update-alternatives --config java
# Select the entry pointing to java-17
```

Also set `JAVA_HOME` in your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
source ~/.bashrc
```

### 4. Android Studio & SDK

**Download Android Studio:**


Follow the setup wizard to install the Android SDK. When asked, install:

- **Android SDK Platform 35 or 36 or multiple**
- **Android SDK Build-Tools 35.0.0**
- **Android Emulator**
- **Android SDK Platform-Tools** (includes ADB)

**Set SDK environment variables** in `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export ANDROID_HOME=$HOME/Android/Sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/emulator' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/platform-tools' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/tools' >> ~/.bashrc
source ~/.bashrc
```


If missed in the setup open the project and do this:



```
Depending on your OS (Linux/Windows), follow this path:

File > Settings (on Linux/Windows)
OR Android Studio > Settings (on macOS)
└── Languages & Frameworks
└── Android SDK

Step-by-Step Selection Guide
Once you are in the Android SDK window, follow these two tabs to find your specific items:

1. For the SDK Platforms (34. 35, 36) // should work on all versions
Stay on the SDK Platforms tab.

Check the boxes for Android 15.0 ("VanillaIceCream") (API 35) or Android 16 (API 36).

Note: If you don't see them, check "Show Package Details" in the bottom right corner.

2. For Build-Tools, Emulator, and Platform-Tools
Switch to the SDK Tools tab (next to SDK Platforms). Look for these specific lines:

Android SDK Build-Tools: * Check the box.

Tip: Check "Show Package Details" to select specifically 35.0.0.

Android Emulator: * Check this box to enable the CLI emulator commands we discussed earlier.

Android SDK Platform-Tools: * Check this box. This installs adb, which is essential for bridge communication between your PC and your phone/emulator.

```

**Verify ADB is available:**

```bash
adb --version
```

### 5. Create an Android Emulator

You can create and manage emulators visually via **Android Studio → Device Manager**.

Select devices with later versions

**Start the emulator:**

```bash
emulator -avd Pixel_8_API_35 -no-snapshot & 

```

-no-snapshot would cold boot the emulator, clearing cache or if the emulator lags at times

You can alot the RAM OR NUMBER OF CORES TO THE EMULATOR FROM ANDROID STUDIO AVD MANAGER -> 

Always load the app after this step is complete once, there is always missed cache


---

## Build Setup

### 1. Clone & Install

```bash
git clone https://github.com/mcstoer/social-app.git
cd social-app
yarn install
```

### 2. Set Up Environment Variables

Copy the example `.env` file to the project root:

```bash
cp .env.example .env
```

`EXPO_PUBLIC_IADDRESS`: The i-address that is signing the responses. This can be a name in the format of "Name@".


### 3. Set Up google-services.json

A real Firebase project is **not required** for local development:

```bash
cp google-services.json.example google-services.json
```

Only replace this with a real `google-services.json` if you need push notifications to actually work.

### 4. Prebuild (Generate the Android Project)

The `android/` folder is **generated** by Expo and not committed to git. Run:

```bash
yarn prebuild
```

Re-run this anytime you:
- Change `app.config.js`
- Add or remove a native dependency
- Add or remove an Expo plugin

### 5. Build & Run App and Signing Server


Subsequently in another terminal run

```
cd vskysigningserver 
yarn install

yarn dev
```

<b> This will run the signing server which would listen to the daemon. The `EXPO_PUBLIC_IADDRESS` should be same as daemon</b>


Make sure your emulator is running or a device is connected (`adb devices` to check), then:

```bash
yarn android
```

Release variant (for testing production behavior locally):

```bash
yarn android:prod
```

---

## Troubleshooting

### Build fails mid-way / corrupted `android/` state

Wipe the generated folder and start fresh:

```bash
rm -rf android
yarn prebuild
yarn android
```

This is the most reliable fix for any Gradle or prebuild related errors.

### `google-services.json` not found

```bash
cp google-services.json.example google-services.json
```

### `ANDROID_HOME` not set / SDK not found

Make sure your shell profile has the correct exports and you've sourced it:

```bash
source ~/.bashrc
echo $ANDROID_HOME  # should print e.g. /home/yourname/Android/Sdk
```


### Android emulator can't reach localhost services

If running local backend services, expose them to the emulator:

```bash
adb reverse tcp:25000 tcp:25000  # repeat for each port needed
```

### KVM not enabled (emulator is very slow)

On Linux, enabling KVM dramatically speeds up the emulator:

```bash
sudo apt install -y qemu-kvm
sudo adduser $USER kvm
# Log out and back in, then restart the emulator
```

---

## Project SDK Versions (Reference)

| Setting | Value |
|---|---|
| `compileSdkVersion` | 36 |
| `targetSdkVersion` | 35 |
| `minSdkVersion` | 23 (Android 6.0+) |
| `buildToolsVersion` | 35.0.0 |
| Node | >= 20 |
| Yarn | 1.22.22 |
| React Native | 0.81.5 |
| Expo SDK | 54 |