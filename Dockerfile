FROM oven/bun:1.1.38-alpine AS frontend_build
WORKDIR /frontend
COPY ./src/frontend ./src/frontend
COPY frontend-build.ts package.json bun.lockb .
RUN bun install && bun run build

FROM python:3.12.7 AS release
WORKDIR /app

# Install system dependencies for Docking and PLIP
RUN apt-get update && apt-get install -y \
    autodock-vina \
    openbabel \
    libopenbabel-dev \
    swig \
    pkg-config \
    libxml2-dev \
    libxslt1-dev \
    && ln -s /usr/include/openbabel3 /usr/local/include/openbabel3 \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables for OpenBabel compilation
ENV CFLAGS="-I/usr/include/openbabel3"
ENV CXXFLAGS="-I/usr/include/openbabel3"
ENV SWIG_FEATURES="-I/usr/include/openbabel3"

COPY . .
COPY --from=frontend_build /frontend/src/static/build ./src/static/build

# Install python dependencies
RUN pip install --no-cache-dir \
    requests biopython meeko rdkit plip \
    chemprop==1.6.1 \
    -r requirements.txt

CMD [ "python3", "src/main.py" ]
