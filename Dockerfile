# Use the official Node.js image.
FROM node:20-slim

# Create and change to the app directory.
WORKDIR /app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json and package-lock.json are copied.
COPY package*.json ./

# Install dependencies.
RUN npm install

# Copy local code to the container image.
COPY . .

# Build the React application.
RUN npm run build

# Expose the port the app runs on.
EXPOSE 3000

# Run the web service on container startup.
CMD [ "npm", "start" ]
