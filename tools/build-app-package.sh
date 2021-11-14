set -eu

APP_NAME="modbus-mqtt"
STAY=$(pwd)
BUILD_DIR=".build"
DIST_DIR="dist"
WORKDIR="${BUILD_DIR}/${APP_NAME}"

echo "Building Senses app distribution ..."
rm -rf ${BUILD_DIR}
mkdir -p ${WORKDIR}
mkdir -p ${WORKDIR}/config.examples
cp -rv package.json yarn.lock manifest.json ecosystem.config.js bin lib runtime scripts ${WORKDIR}
cp -rv config/* ${WORKDIR}/config.examples

cd ${WORKDIR}
NODE_ENV="production" yarn
ln -sf /config/${APP_NAME} config
chmod +x bin/*
chmod +x scripts/*
cd ${STAY}

echo "Creating squashfs image ..."
mksquashfs ${WORKDIR}/* ${BUILD_DIR}/${APP_NAME}.sqfs -all-root

echo "Publishing distribution files ..."
mkdir -p ${DIST_DIR}
cp ${BUILD_DIR}/${APP_NAME}.sqfs ${DIST_DIR}
ls -lah ${DIST_DIR}

echo "DONE! Files are published in ${DIST_DIR}/"
