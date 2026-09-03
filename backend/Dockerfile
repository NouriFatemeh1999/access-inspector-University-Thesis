# ============================================================
# Dockerfile for Access Inspector backend
# Builds a Node.js image with our Express server inside.
# ============================================================

# 1. Start from an official Node.js image (Alpine = tiny Linux)
FROM node:20-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package files FIRST (separate step = faster rebuilds when only code changes)
COPY package*.json ./

# 4. Install dependencies inside the container
#    (better-sqlite3 needs build tools, so we install them, then remove them)
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install --omit=dev \
    && apk del .build-deps

# 5. Copy the rest of the source code
COPY . .

# 6. Tell Docker the container listens on port 3000
EXPOSE 3000

# 7. The command to run when the container starts
CMD ["node", "server.js"]
