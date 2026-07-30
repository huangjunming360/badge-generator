FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /app
COPY render.mjs ./render.mjs
USER pwuser
ENTRYPOINT ["node", "/app/render.mjs"]
