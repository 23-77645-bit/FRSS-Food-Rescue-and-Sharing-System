FROM node:24.22.1-bookworm-slim

ENV ANDROID_HOME=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    APPIUM_HOME=/app
ENV PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/cmdline-tools/latest/bin:${JAVA_HOME}/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/android-sdk/cmdline-tools /tmp/android-tools \
    && curl --fail --location --retry 3 https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -o /tmp/android-tools.zip \
    && unzip -q /tmp/android-tools.zip -d /tmp/android-tools \
    && mv /tmp/android-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest \
    && rm -rf /tmp/android-tools /tmp/android-tools.zip
RUN yes | sdkmanager --licenses > /dev/null
RUN sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tests/mobile ./tests/mobile

EXPOSE 4723
CMD ["./node_modules/.bin/appium", "server", "--address", "0.0.0.0", "--port", "4723", "--allow-insecure", "uiautomator2:chromedriver_autodownload"]
