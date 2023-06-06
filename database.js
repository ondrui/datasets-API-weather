import 'dotenv/config';
import { createConnection } from 'mysql';
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
