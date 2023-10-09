import { createInterface } from "readline";
import fetch from "node-fetch";
import { writeFile, access } from "fs/promises";
import { homedir } from "os";
import * as debug from "debug";
import * as AdmZip from "adm-zip";

function ask(query: string) {
  const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
      rl.close();
      resolve(ans);
  }))
}

const icloudDrivePath = `${homedir()}/Library/Mobile\ Documents/com~apple~CloudDocs`;
const baseApi = 'https://connect.garmin.com/';
const activitiesApi = 'activitylist-service/activities/search/activities';
const downloadApi = 'download-service/files/activity/';

const headers = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/118.0",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "pl,en-US;q=0.8,en;q=0.5,da;q=0.3",
  "NK": "NT",
  "X-app-ver": "4.71.1.4",
  "X-lang": "pl-PL",
  "DI-Backend": "connectapi.garmin.com",
  "Authorization": "Bearer <put your token here>",
  "X-Requested-With": "XMLHttpRequest",
  "baggage": "sentry-environment=prod,sentry-release=connect%404.71.149,sentry-public_key=f0377f25d5534ad589ab3a9634f25e71,sentry-trace_id=2a59fd6df917472da050af3219cf4ae9,sentry-sample_rate=1",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "Cookie": "<put your cookies here>",
  "Referer": "https://connect.garmin.com/modern/activities"
}


async function downloadFit(activityId: number) {
  const l = debug('fit');
  const url = `${baseApi}${downloadApi}${activityId}`;
  l('Loading activity %d', activityId);
  const res = await fetch(url, {
    headers: {
      ...headers,
      "Accept": "*/*"
    },
    method: 'GET',
  });
  if (res.status !== 200) {
    throw res;
  }
  const data = await res.buffer();
  l('loaded data for %d', activityId);

  return data;
}

function getActivityPath(id: number) {
  return `${icloudDrivePath}/garmin-exports/${id}.fit`;
}

async function isDownloaded(id: number) {
  const path = getActivityPath(id);
  try {
    await access(path);
    return true;
  } catch (e) {
    return false;
  }
}

async function saveFit(activityId: number, data: Buffer) {
  const zip = new AdmZip(data);
  const entries = zip.getEntries();
  if (entries.length !== 1) {
    throw new Error('Unknown zip file');
  }
  await writeFile(getActivityPath(activityId), entries[0].getData());
}

async function extractApi() {
  const l = debug('api');
  const params = '?limit=20&start=0&_=1696370384292';
  const url = `${baseApi}${activitiesApi}${params}`;
  l('Querying API for activites...');
  const res = await fetch(url, {
    headers,
    method: 'GET'
  });
  if (res.status !== 200) {
    throw res;
  }
  const activitiesData: any[] = await res.json();
  l('Found %d activities', activitiesData.length);

  const ids = activitiesData.map(a => a.activityId).reverse();
  for (var id of ids) {
    if (await isDownloaded(id)) {
      l('Skipping %d because it already exists', id);
      continue;
    }
    const data = await downloadFit(id);
    await saveFit(id, data);
  }
}

debug.enable('*');
extractApi().catch((err) => {
  console.error(err);
});
