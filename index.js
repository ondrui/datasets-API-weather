import fetch from "node-fetch";
import dotenv from "dotenv";
import { connection, connection1 } from "./database.js";
// import { CronJob } from "cron";
// import { createConnection } from 'mysql';

dotenv.config({ path: "~/projects/datasets-API-weather/.env" });

// request options Open-Meteo API.
const propertiesURL = {
  origin: "https://api.open-meteo.com",
  pathname: "/v1/forecast",
  params: {
    latitude: { name: "latitude", value: 55.836 },
    longitude: { name: "longitude", value: 37.555 },
    hourly: {
      name: "hourly",
      value: "temperature_2m,precipitation,weathercode",
    },
    models: {
      MFW: "meteofrance_arpege_world",
      MFE: "meteofrance_arpege_europe",
      bestMatch: "best_match",
      iconGlobal: "icon_global",
      iconEU: "icon_eu",
      gfsGlobal: "gfs_global",
      gemGlobal: "gem_global",
      ecmwfIfs04: "ecmwf_ifs04",
      jmaGsm: "jma_gsm",
    },
    forecast_days: { name: "forecast_days", value: 2 },
  },
};

const modelsList = Object.keys(propertiesURL.params.models);

// Terminating a connection db gracefully.
const closeConnectionDb = () => {
  connection.end(function (err) {
    if (err) {
      return console.log("error:" + err.message);
    }
    console.log("Close the database connection.");
  });
};

const closeConnectionDbU = () => {
  connection1.end(function (err) {
    if (err) {
      return console.log("error:" + err.message);
    }
    console.log("Close the database U connection.");
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

//-----------------------------------------------------------------

// 2. IF fetch data from single resource. Open-Meteo API.
const urlOpenMeteo = new URL(
  `${propertiesURL.origin}${propertiesURL.pathname}`
);
Object.entries(propertiesURL.params).forEach(([k, v]) => {
  if (k === "models") {
    let str = "";
    modelsList.forEach((item) => (str += v[item] + ","));
    str.slice(0, -1);
    urlOpenMeteo.searchParams.set(k, str.slice(0, -1));
  } else {
    urlOpenMeteo.searchParams.set(k, v.value);
  }
});
// HMN resource string.
const urlHMN = `${process.env.URL_API}?lat=55.835970&lon=37.555039&type=1&period=48&mode=point&block=forecast&cid=${process.env.KEY_API}`;

// Load data from our db ECMWF model. Create promise.
const sqlU = `
    SELECT
    DateOt,
    DATE_ADD(DateOt,INTERVAL dt HOUR) AS forecast_time,
    T AS temperature_2m,
    "ecmwf_balchug" AS model,
    NULL AS precipitation,
    NULL AS weathercode
    FROM
    model
    WHERE
    st_index = 27605
    AND
    Model = 104
    AND
    Level = 2001
    ORDER BY
    DateOt;
    `;
const resultU = new Promise((resolve, reject) => {
  connection1.query(sqlU, (err, result) => {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  });
});

/**
 * Enable running queries on the database.
 * @param dataOM Data object Open-Meteo API.
 * @param dataHMN Data object HMN API.
 * @param dataU Data array our db (alias"U").
 */
const insertDataToDB = (dataOM, dataHMN, dataU) => {
  // db table name
  const tabName = "data_copy";

  // Setting the timestamp in the correct format.
  const time = new Date().toISOString().slice(0, -5);

  // HMN API
  const { forecast_1 } = dataHMN;
  delete forecast_1.start_date;
  Object.values(forecast_1).forEach((obj) => {
    Object.values(obj).forEach((value) => {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const strValue = `"${time}", "${value.date}", "hmn", ${value.temp}, NULL, NULL`;
        const sql = `INSERT INTO ${tabName} (runtime, forecast_time, model, temperature_2m, precipitation, weathercode) VALUES (${strValue});`;
        connection.query(sql, function (err) {
          if (err) console.log(err);
          // console.log("Row has been updated");
        });
      }
    });
  });

  // From our db ECMWF model.
  dataU.forEach((value) => {
    const strValue = `"${value.DateOt.toISOString().slice(0, -5)}", "${time}", "${value.forecast_time.toISOString().slice(0, -5)}", "ecmwf_balchug", ${value.temperature_2m}, NULL, NULL`;
    const sql = `INSERT INTO ${tabName} (DateOt, runtime, forecast_time, model, temperature_2m, precipitation, weathercode) VALUES (${strValue});`;
    connection.query(sql, function (err) {
      if (err) console.log(err);
      console.log("Row has been updated");
    });
  });

  // Weather Forecast API
  const models = Object.values(propertiesURL.params.models);
  models.forEach((model) => {
    const arrTime = Array(dataOM.hourly[`temperature_2m_${model}`].length).fill(
      time
    );
    const arrForecastTime = dataOM.hourly.time;
    const arrModel = Array(
      dataOM.hourly[`temperature_2m_${model}`].length
    ).fill(model);
    const arrTemp = dataOM.hourly[`temperature_2m_${model}`];
    const arrPrecip = dataOM.hourly[`precipitation_${model}`];
    const arrWCode = dataOM.hourly[`weathercode_${model}`];
    arrTime.forEach((str, index) => {
      const strValue = `"${str}", "${arrForecastTime[index]}", "${arrModel[index]}", ${arrTemp[index]}, ${arrPrecip[index]}, ${arrWCode[index]}`;
      const sql = `INSERT INTO ${tabName} (runtime, forecast_time, model, temperature_2m, precipitation, weathercode) VALUES (${strValue});`;
      connection.query(sql, function (err) {
        if (err) console.log(err);
        // console.log("Row has been updated");
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
    const dataU = await resultU;
    insertDataToDB(dataOM, dataHMN, dataU);
  } catch (error) {
    console.error("Error! Could not reach the API or db connections. " + error);
  }
  closeConnectionDb();
  closeConnectionDbU();
};

fetchData(urlOpenMeteo, urlHMN);

// Schedule tasks to be run on the server.

// const job = new CronJob('0 */2 * * * *', function () {
//   const connection = createConnection({
//     host: process.env.HOST,
//     user: process.env.USER_DB,
//     password: process.env.PASSWORD_DB,
//     database: process.env.NAME_DB,
//   })
//   connection.connect((err) => {
//     if (err) {
//       console.log(err)
//       return
//     }
//     console.log('Connected to the MySQL server.')
//   })
//   const d = new Date();
//   fetchData(urlOpenMeteo, urlHMN, connection);
//   console.log('Every 15 second:', d);
// });
// job.start();
