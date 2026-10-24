
FROM mcr.microsoft.com/mssql/server:2022-latest

USER root

COPY init.sql /docker-init/init.sql
COPY entrypoint.sh /docker-init/entrypoint.sh

RUN chmod +x /docker-init/entrypoint.sh

EXPOSE 1433

USER mssql

ENTRYPOINT ["/docker-init/entrypoint.sh"]

