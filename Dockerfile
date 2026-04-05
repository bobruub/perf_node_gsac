# Use Node.js 18+ for native fetch support
FROM node:18-alpine

# Suppress Node.js warnings (including TLS warning)
ENV NODE_NO_WARNINGS=1

# Set working directory
WORKDIR /app
RUN mkdir -p /app/data

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install
RUN npm install dotenv

# Copy the script and schedule file
COPY gsac.js ./
COPY .env ./

# Set environment variables for credentials (override at runtime if needed)
# ENV GESAC_LOGIN=your_login_here
# ENV GESAC_PASSWORD=your_password_here

# Run the script
CMD ["node", "gsac.js"]