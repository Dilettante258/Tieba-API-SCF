import log4js from "log4js";
log4js.configure({
  appenders: {
    console: { type: "console" },
    app: { type: "file", filename: "application.log" },
  },
  categories: {
    default: { appenders: ["console"], level: "trace" },
    catA: { appenders: ["console"], level: "error" },
    "catA.catB": { appenders: ["app"], level: "trace" },
  },
});

const loggerA = log4js.getLogger("catA");
loggerA.error("This will be written to console with log level ERROR");
loggerA.trace("This will not be written");
const loggerAB = log4js.getLogger("catA.catB");
loggerAB.error(
  "This will be written with log level ERROR to console and to a file"
);
loggerAB.trace(
  "This will be written with log level TRACE to console and to a file"
);
