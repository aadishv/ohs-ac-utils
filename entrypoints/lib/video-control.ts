// Video control functions to be injected into pages
// This replaces the content script approach

declare global {
  interface Window {
    __acaiVideoControl?: {
      setVideoTime: (timestamp: number) => boolean;
      getVideoTime: () => number | null;
      getVideoDuration: () => number | null;
      findVideoElement: () => HTMLVideoElement | null;
    };
  }
}

export interface VideoControlResponse {
  success?: boolean;
  currentTime?: number | null;
  duration?: number | null;
  error?: string;
  pong?: boolean;
}

// This function is no longer needed since we inject directly

export async function injectVideoControl(tabId: number): Promise<boolean> {
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        console.log('🚀 Video control script injected!');
        console.log('🌐 Current URL:', window.location.href);
        console.log('📺 Looking for video elements...');

        function findVideoElement() {
          const video = document.querySelector('video') ||
                       document.querySelector('iframe video') ||
                       document.querySelector('[data-video]') ||
                       document.querySelector('.video-player video');
          
          console.log('🔍 Video element found:', video ? '✅ Yes' : '❌ No');
          return video;
        }

        function setVideoTime(timestamp: number) {
          const video = findVideoElement();
          if (video) {
            video.currentTime = timestamp;
            console.log('⏰ Set video time to:', timestamp);
            return true;
          }
          console.log('❌ Could not set video time - no video found');
          return false;
        }

        function getVideoTime() {
          const video = findVideoElement();
          const time = video ? video.currentTime : null;
          console.log('⏱️ Current video time:', time);
          return time;
        }

        function getVideoDuration() {
          const video = findVideoElement();
          const duration = video ? video.duration : null;
          console.log('📏 Video duration:', duration);
          return duration;
        }

        // Store functions globally so they can be called from the extension
        window.__acaiVideoControl = {
          setVideoTime,
          getVideoTime,
          getVideoDuration,
          findVideoElement
        };

        console.log('✅ Video control functions ready!');
      }
    });
    return true;
  } catch (error) {
    console.error('Failed to inject video control script:', error);
    return false;
  }
}

export async function setVideoTime(tabId: number, timestamp: number): Promise<VideoControlResponse> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (ts: number) => {
        if (window.__acaiVideoControl) {
          const success = window.__acaiVideoControl.setVideoTime(ts);
          return { success };
        }
        return { error: 'Video control not initialized' };
      },
      args: [timestamp]
    });
    
    return results[0].result || { error: 'No result returned' };
  } catch (error) {
    console.error('Failed to set video time:', error);
    return { error: (error as Error).message };
  }
}

export async function getVideoTime(tabId: number): Promise<VideoControlResponse> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__acaiVideoControl) {
          const currentTime = window.__acaiVideoControl.getVideoTime();
          return { currentTime };
        }
        return { error: 'Video control not initialized' };
      }
    });
    
    return results[0].result || { error: 'No result returned' };
  } catch (error) {
    console.error('Failed to get video time:', error);
    return { error: (error as Error).message };
  }
}

export async function getVideoDuration(tabId: number): Promise<VideoControlResponse> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__acaiVideoControl) {
          const duration = window.__acaiVideoControl.getVideoDuration();
          return { duration };
        }
        return { error: 'Video control not initialized' };
      }
    });
    
    return results[0].result || { error: 'No result returned' };
  } catch (error) {
    console.error('Failed to get video duration:', error);
    return { error: (error as Error).message };
  }
}

export async function pingVideo(tabId: number): Promise<VideoControlResponse> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__acaiVideoControl) {
          return { pong: true };
        }
        return { error: 'Video control not initialized' };
      }
    });
    
    return results[0].result || { error: 'No result returned' };
  } catch (error) {
    console.error('Failed to ping video control:', error);
    return { error: (error as Error).message };
  }
}