FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Create non-root user
RUN addgroup --system --gid 1001 mailguard && \
    adduser --system --uid 1001 --ingroup mailguard mailguard

# Ensure proper ownership
RUN chown -R mailguard:mailguard /app

# Switch to non-root user
USER mailguard

# Expose port
EXPOSE 3000

# Start
CMD ["npm", "start"]