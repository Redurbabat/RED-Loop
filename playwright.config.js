import {defineConfig, devices} from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser', fullyParallel:true, workers:2, reporter:[['list'],['json',{outputFile:'test-results/browser.json'}]],
  use:{baseURL:process.env.RED_LOOP_BASE_URL || 'http://127.0.0.1:8787',trace:'retain-on-failure'},
  webServer:process.env.RED_LOOP_BASE_URL ? undefined : {command:'npm run dev:test',url:'http://127.0.0.1:8787/health',reuseExistingServer:!process.env.CI,timeout:60000},
  projects:[
    {name:'windows-chromium',testIgnore:'**/extension.spec.js',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'iphone-webkit',testIgnore:'**/extension.spec.js',use:{...devices['iPhone 13'],defaultBrowserType:'webkit'}},
    {name:'ipad-webkit',testIgnore:'**/extension.spec.js',use:{...devices['iPad (gen 7)'],defaultBrowserType:'webkit'}},
    {name:'macbook-webkit',testIgnore:'**/extension.spec.js',use:{...devices['Desktop Safari'],viewport:{width:1440,height:1000}}},
    {name:'windows-extension',testMatch:'**/extension.spec.js',use:{...devices['Desktop Chrome']}}
  ]
});
