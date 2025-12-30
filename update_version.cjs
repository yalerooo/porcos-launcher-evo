const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Please provide a version number. Usage: node update_version.js <version>');
    process.exit(1);
}

console.log(`Updating version to ${newVersion}...`);

// 1. Update package.json
const packageJsonPath = path.join(__dirname, 'package.json');
try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('Updated package.json');
} catch (e) {
    console.error('Failed to update package.json:', e);
}

// 1.5 Update package-lock.json
const packageLockJsonPath = path.join(__dirname, 'package-lock.json');
try {
    if (fs.existsSync(packageLockJsonPath)) {
        const packageLockJson = JSON.parse(fs.readFileSync(packageLockJsonPath, 'utf8'));
        packageLockJson.version = newVersion;
        if (packageLockJson.packages && packageLockJson.packages[""]) {
            packageLockJson.packages[""].version = newVersion;
        }
        fs.writeFileSync(packageLockJsonPath, JSON.stringify(packageLockJson, null, 2) + '\n');
        console.log('Updated package-lock.json');
    }
} catch (e) {
    console.error('Failed to update package-lock.json:', e);
}

// 2. Update src-tauri/tauri.conf.json
const tauriConfPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
try {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    // tauriConf.package = tauriConf.package || {};
    // tauriConf.package.version = newVersion; // Just in case, though usually top-level version is used in v2
    if (tauriConf.package) {
        delete tauriConf.package;
    }
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log('Updated src-tauri/tauri.conf.json');
} catch (e) {
    console.error('Failed to update src-tauri/tauri.conf.json:', e);
}

// 3. Update src-tauri/Cargo.toml
const cargoTomlPath = path.join(__dirname, 'src-tauri', 'Cargo.toml');
try {
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
    // Regex to replace version = "x.y.z" inside [package] section
    // This is a simple regex, assuming standard Cargo.toml formatting
    cargoToml = cargoToml.replace(/^version = "[^"]+"/m, `version = "${newVersion}"`);
    fs.writeFileSync(cargoTomlPath, cargoToml);
    console.log('Updated src-tauri/Cargo.toml');
} catch (e) {
    console.error('Failed to update src-tauri/Cargo.toml:', e);
}

// 4. Update src-tauri/src/launcher/minecraft_launcher.rs
const launcherRsPath = path.join(__dirname, 'src-tauri', 'src', 'launcher', 'minecraft_launcher.rs');
try {
    let launcherRs = fs.readFileSync(launcherRsPath, 'utf8');
    // Replace substitutions.insert("${launcher_version}", "x.y.z".to_string());
    const regex = /substitutions\.insert\("\$\{launcher_version\}", "[^"]+"\.to_string\(\)\);/;
    const replacement = `substitutions.insert("\${launcher_version}", "${newVersion}".to_string());`;
    
    if (regex.test(launcherRs)) {
        launcherRs = launcherRs.replace(regex, replacement);
        fs.writeFileSync(launcherRsPath, launcherRs);
        console.log('Updated src-tauri/src/launcher/minecraft_launcher.rs');
    } else {
        console.warn('Could not find launcher_version string in minecraft_launcher.rs');
    }
} catch (e) {
    console.error('Failed to update src-tauri/src/launcher/minecraft_launcher.rs:', e);
}

console.log('Version update complete!');
