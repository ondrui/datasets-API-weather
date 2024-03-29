/* eslint-disable camelcase */
import dotenv from 'dotenv';
import mysql from 'mysql';
import { connectionDatasets, connectionForec } from './database.js';
dotenv.config({ path: '~/projects/datasets-API-weather/.env' });

// db table name to insert and save data from APIs and our db
const TAB_NAME_DB = 'data';
/**
 * Remove milliseconds and the suffix Z from datetime string ('.000Z').
 * @param {string} str Date Time String. In format 'YYYY-MM-DDTHH:mm:ss.sssZ'
 * @param {number} num default value -5.
 * @returns
 */
const removeMsZ = (str, num = -5) => str.slice(0, num);
// Helper Functions
const formatedDatetime = (date) =>
  typeof date === 'string' ? removeMsZ(date) : removeMsZ(date.toISOString());

// request options Open-Meteo API.
const propertiesURL = {
  origin: 'https://api.open-meteo.com',
  pathname: '/v1/forecast',
  params: {
    latitude: { name: 'latitude', value: 55.836 },
    longitude: { name: 'longitude', value: 37.555 },
    hourly: {
      name: 'hourly',
      value: 'temperature_2m,precipitation,weathercode',
    },
    models: {
      MFW: 'meteofrance_arpege_world',
      MFE: 'meteofrance_arpege_europe',
      bestMatch: 'best_match',
      iconGlobal: 'icon_global',
      iconEU: 'icon_eu',
      gfsGlobal: 'gfs_global',
      gemGlobal: 'gem_global',
      ecmwfIfs04: 'ecmwf_ifs04',
      jmaGsm: 'jma_gsm',
    },
    forecast_days: { name: 'forecast_days', value: 2 },
  },
};

const modelsList = Object.keys(propertiesURL.params.models);

// Terminating a connection db gracefully.
const closeConnectionDb = () => {
  connectionDatasets.end(function (err) {
    if (err) {
      return console.log('error:' + err.message);
    }
    console.log('Close the database connectionDatasets.');
  });
};

const closeConnectionDbU = () => {
  connectionForec.end(function (err) {
    if (err) {
      return console.log('error:' + err.message);
    }
    console.log('Close the database U connectionDatasets.');
  });
};

// 1. If fetch multple resources. Open-Meteo API.
// Build list of URL resources.
// const resourceList = modelsList.map((key) => {
//   const url = new URL(`${propertiesURL.origin}${propertiesURL.pathname}`);
//   Object.entries(propertiesURL.params).forEach(([k, v]) => {
//     if (k === "models") {
//       const a = v[key];
//       url.searchParams.set(k, v[key]);
//     } else {
//       url.searchParams.set(k, v.value);
//     }
//   });
//   return url;
// });
// Fetch data from APIs.
// const fetchJSON = async (url) => {
//   try {
//     const response = await fetch(url);
//     return {
//       data: await response.json(),
//       model: url.searchParams.get('models'),
//     };
//   } catch(error) {
//     console.error("Error! Could not reach the API. " + error);
//   }
// };

// const allData = await Promise.all(
//   resourceList.map(url => fetchJSON(url))
// );
// allData.forEach(obj => console.log(obj.model, obj.data));

// -----------------------------------------------------------------

// 2. IF fetch data from single resource. Open-Meteo API.
const urlOpenMeteo = new URL(
  `${propertiesURL.origin}${propertiesURL.pathname}`,
);
Object.entries(propertiesURL.params).forEach(([k, v]) => {
  if (k === 'models') {
    let str = '';
    modelsList.forEach((item) => (str += v[item] + ','));
    str.slice(0, -1);
    urlOpenMeteo.searchParams.set(k, str.slice(0, -1));
  } else {
    urlOpenMeteo.searchParams.set(k, v.value);
  }
});
// HMN resource string.
const urlHMN = `${process.env.URL_API}?lat=55.835970&lon=37.555039&type=1&period=48&mode=point&block=forecast&cid=${process.env.KEY_API}`;

// Load data from our db ECMWF model by condition. Create query connection promise and async function.

const resultU = async () => {
  // 1 Находим самую последнюю (свежая) дату в поле "runtime" базы "data".
  const sqlLastRuntimeDataDB = `SELECT runtime FROM ${TAB_NAME_DB} WHERE model='ecmwf_balchug' ORDER BY runtime  DESC LIMIT 1`;

  const [lastRuntime] = await new Promise((resolve, reject) => {
    connectionDatasets.query(sqlLastRuntimeDataDB, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });

  // 2 Готовим строку для запроса к БД.
  // Если "свежая" дата отсутствует, то устанавливаем дефолтную дату.
  // Получаем данные из бозы "forec" таблица "model".

  const defaultDateFresh = '0000-00-00 00:00';
  const dateFresh = lastRuntime
    ? formatedDatetime(lastRuntime.runtime)
    : defaultDateFresh;

  const sqlU = `
    SELECT
    DateOt AS runtime,
    DATE_ADD(DateOt,INTERVAL dt HOUR) AS forecast_time,
    T AS temperature_2m,
    "ecmwf_balchug" AS model,
    NULL AS precipitation,
    NULL AS weathercode
    FROM
    model
    WHERE
    DateOt > ?
    AND
    st_index = 27605
    AND
    Model = 104
    AND
    Level = 2001
    ORDER BY
    runtime;
    `;
  const sqlFormated = mysql.format(sqlU, [dateFresh]);

  return new Promise((resolve, reject) => {
    connectionForec.query(sqlFormated, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

/**
 * Enable running queries on the database.
 * @param dataOM Data object Open-Meteo API.
 * @param dataHMN Data object HMN API.
 * @param dataU Data array our db (alias"U").
 */
const insertDataToDB = (dataOM, dataHMN, dataU) => {
  // Setting the timestamp in the correct format.
  // const currentTime = "2023-07-19 10:00:02";
  const currentTime = formatedDatetime(new Date());

  // HMN API
  const { forecast_1 } = dataHMN;
  delete forecast_1.start_date;
  Object.values(forecast_1).forEach((obj) => {
    Object.values(obj).forEach((value) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const sql = `INSERT INTO ${TAB_NAME_DB} (request_time, forecast_time, model, temperature_2m, precipitation, weathercode) VALUES (?, ?, "hmn", ?, NULL, NULL);`;

        const sqlFormated = mysql.format(sql, [
          currentTime,
          value.date,
          value.temp,
        ]);

        connectionDatasets.query(sqlFormated, function (err) {
          if (err) console.log(err);
          console.log('Row dataHMN has been updated');
        });
      }
    });
  });

  // From our db ECMWF model.
  if (dataU.length > 0) {
    dataU.forEach((value) => {
      const sql = `INSERT INTO ${TAB_NAME_DB} (runtime, request_time, forecast_time, model, temperature_2m, precipitation, weathercode) VALUES (?, ?, ?, "ecmwf_balchug", ?, NULL, NULL);`;

      const sqlFormated = mysql.format(sql, [
        formatedDatetime(value.runtime),
        currentTime,
        formatedDatetime(value.forecast_time),
        value.temperature_2m,
      ]);

      connectionDatasets.query(sqlFormated, function (err) {
        if (err) console.log(err);
        console.log('Row ECMWF has been updated');
      });
    });
  }

  // Weather Forecast API
  const models = Object.values(propertiesURL.params.models);
  models.forEach((model) => {
    const arrTime = Array(dataOM.hourly[`temperature_2m_${model}`].length).fill(
      currentTime,
    );
    const arrForecastTime = dataOM.hourly.time;
    const arrModel = Array(
      dataOM.hourly[`temperature_2m_${model}`].length,
    ).fill(model);
    const arrTemp = dataOM.hourly[`temperature_2m_${model}`];
    const arrPrecip = dataOM.hourly[`precipitation_${model}`];
    const arrWCode = dataOM.hourly[`weathercode_${model}`];
    arrTime.forEach((str, index) => {
      const arrValue = [
        str,
        arrForecastTime[index],
        arrModel[index],
        arrTemp[index],
        arrPrecip[index],
        arrWCode[index],
      ];

      const sql = `INSERT INTO ${TAB_NAME_DB} (request_time, forecast_time, model, temperature_2m, precipitation, weathercode) VALUES (?);`;

      const sqlFormated = mysql.format(sql, [arrValue]);

      connectionDatasets.query(sqlFormated, function (err) {
        if (err) console.log(err);
        console.log('Row Weather Forecast API has been updated');
      });
    });
  });
};

/**
 * Fetch data from resources and performing queries db.
 * @param urlOpenMeteo URL object Open-Meteo API.
 * @param urlHMN HMN URL resource string.
 */
const fetchData = async (urlOpenMeteo, urlHMN) => {
  try {
    const responseOM = await fetch(urlOpenMeteo);
    const dataOM = await responseOM.json();
    const responseHMN = await fetch(urlHMN);
    const dataHMN = await responseHMN.json();
    const dataU = await resultU();
    insertDataToDB(dataOM, dataHMN, dataU);
  } catch (error) {
    console.error('Error! Could not reach the API or db connections. ' + error);
  }
  closeConnectionDb();
  closeConnectionDbU();
};

fetchData(urlOpenMeteo, urlHMN);
