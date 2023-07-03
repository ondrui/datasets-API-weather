import dotenv from 'dotenv'
import { createConnection } from 'mysql';

dotenv.config({ path: '~/projects/datasets-API-weather/.env' });

export const connection = createConnection({
  host: process.env.HOST,
  user: process.env.USER_DB,
  password: process.env.PASSWORD_DB,
  database: process.env.NAME_DB,
})
connection.connect((err) => {
  if (err) {
    console.log(err)
    return
  }
  console.log('Connected to the MySQL server.')
});

export const connection1 = createConnection({
  host: process.env.HOST_U,
  user: process.env.USER_DB_U,
  password: process.env.PASSWORD_DB_U,
  database: process.env.NAME_DB_U,
  insecureAuth: true,
})
connection1.connect((err) => {
  if (err) {
    console.log(err)
    return
  }
  console.log('Connected to the MySQL U server.')
});
