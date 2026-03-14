# perf_node_gsac

A Node.js script to automate booking gym classes on geleisure.perfectgym.com.au.

## Features

- Authenticates with the gym website using provided credentials.
- Fetches available classes based on a schedule.
- Attempts to book classes when they become available.
- Sends email notifications for successful bookings or failures.

## Prerequisites

- Node.js 18+ (for native fetch API)
- Docker (for containerized execution)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/bobruub/perf_node_gsac
   cd perf_node_gsac
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the Docker image:
   ```
    build -f "DockerfileTim" -t gsac .
   ```

## Configuration

### Environment Variables

Set the following environment variables:

- `GESAC_LOGIN`: Your gym website login email.
- `GESAC_PASSWORD`: Your gym website password.

For email notifications, the script uses hardcoded Gmail credentials (update in code if needed).

### Schedule

Edit `days.json` to define the classes to book. The file is a JSON array of objects with the following structure:

```json
[
  {
    "checkday": "saturday",
    "checkTime": "09:30",
    "weekday": "monday",
    "startTime": "07:30:00",
    "name": "Aqua Fitness"
  }
]
```

- `checkday`: Day of the week to check for booking (e.g., "saturday").
- `checkTime`: Time to start checking (HH:MM).
- `weekday`: Day of the week the class is on.
- `startTime`: Start time of the class (HH:MM:SS).
- `name`: Name of the class.

## Usage

### Running with Docker

```
docker run -e GESAC_LOGIN=your-email@example.com -e GESAC_PASSWORD=your-password --name gsac_booker gsac
```

### Running with Node.js

```
node gsac.js
```

The script runs in an infinite loop, checking the schedule every 60 seconds and attempting bookings as per the configuration.

## Dependencies

- `nodemailer`: For sending email notifications.
- Built-in Node.js modules: `fs`, `path`.

## Notes

- The script disables SSL verification for debugging (not recommended for production).
- Ensure your Gmail account allows less secure apps or use an app password for SMTP.