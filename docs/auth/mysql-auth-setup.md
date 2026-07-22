# MySQL Auth Setup

This auth implementation expects a MySQL database with `users` and `sessions`
tables.

## Required environment

Use either:

- `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE`
- `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE?sslMode=required`

Or the discrete variables:

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_SSL_MODE` (`required` or `disabled`)

Also set:

- `AUTH_SESSION_SECRET`

## Schema

Apply [mysql-auth-schema.sql](/Users/juice/Desktop/vibe%20coding/ReContent-auth-experience/docs/auth/mysql-auth-schema.sql)
to your AWS MySQL database before enabling the auth routes.

## ECS / AWS notes

- Put `DATABASE_URL` and `AUTH_SESSION_SECRET` in AWS Secrets Manager.
- Inject them into the ECS task definition as environment secrets.
- Ensure the ECS security group can reach the MySQL security group on `3306`.
- Run the database in a private subnet when possible.
- For Amazon RDS, TLS is enabled by default when the host ends with
  `.rds.amazonaws.com`. You can also set `sslMode=required` in `DATABASE_URL`,
  or set `MYSQL_SSL_MODE=required` explicitly.

## Runtime target

This MySQL auth path is intended for Node.js server deployments such as AWS ECS.
If you later want to run the auth flow on Cloudflare Workers, add a Cloudflare-
compatible database transport such as Hyperdrive instead of assuming the ECS
configuration will carry over unchanged.
