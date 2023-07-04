import dotenv from 'dotenv'
import { createConnection } from 'mysql';

dotenv.config({ path: '~/projects/datasets-API-weather/.env' });

export const connectionDatasets = createConnection({
  host: process.env.HOST,
  user: process.env.USER_DB,
  password: process.env.PASSWORD_DB,
  database: process.env.NAME_DB,
})
connectionDatasets.connect((err) => {
  if (err) {
    console.log(err)
    return
  }
  console.log('Connected to the MySQL server.')
});

export const connectionForec = createConnection({
  host: process.env.HOST_U,
  user: process.env.USER_DB_U,
  password: process.env.PASSWORD_DB_U,
  database: process.env.NAME_DB_U,
  insecureAuth: true,
})
connectionForec.connect((err) => {
  if (err) {
    console.log(err)
    return
  }
  console.log('Connected to the MySQL U server.')
});
