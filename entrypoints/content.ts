export default defineContentScript({
  matches: ['*://pcadobeconnect.stanford.edu/*'],
  main() {
    console.log('Hello content.');
  },
});
