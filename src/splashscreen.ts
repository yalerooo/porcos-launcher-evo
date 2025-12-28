import { invoke } from '@tauri-apps/api/core';

async function setup() {
  console.log('Splash screen: Starting frontend setup...');
  
  // Simulate some frontend initialization
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  console.log('Splash screen: Frontend setup complete!');
  
  try {
    await invoke('set_complete', { task: 'frontend' });
    console.log('Splash screen: Frontend task marked as complete');
  } catch (error) {
    console.error('Splash screen: Error invoking set_complete:', error);
  }
}

setup();
