#!/bin/bash
#
# Docker entrypoint for nshmp-haz-ws:
#   - Downloads nshmp-haz and all models
#   - Builds nshmp-haz-ws
#   - Deploys nshmp-haz-ws
####

set -o errexit;
set -o errtrace;

# Import bash functions from usgsnshmp/centos
. ${BASH_FUNCTIONS}

readonly LOG_FILE="docker-entrypoint.log";

# Docker usage
readonly USAGE="
  docker run -p <PORT>:8080 -d usgs/nshmp-haz-ws
";

####
# Build and deploy nshmp-haz-ws.
# Globals:
#   (string) LOG_FILE - The log file
#   (string) TOMCAT_WEBAPPS - Path to Tomcat webapps directory
#   (string) WAR_PATH - Path to nshmp-haz-ws.war
# Arguments:
#   None
# Returns:
#   None
####
main() {
  # Set trap for uncaught errors
  trap 'error_exit "${BASH_COMMAND}" "$(< ${LOG_FILE})" "${USAGE}"' ERR;
  
  # Download repositories
  download_repos;

  # Build nshmp-haz-ws
  ./gradlew assemble 2> ${LOG_FILE};

  # Move war file
  mv ${WAR_PATH} ${TOMCAT_WEBAPPS} 2> ${LOG_FILE};

  # Run Tomcat
  catalina.sh run 1> ${LOG_FILE};
}

####
# Download nshmp-haz and all models.
# Globals:
#   (string) HOME - app home 
#   (string) LOG_FILE - The log file
#   (string) NSHM_AK_2007_VERSION - nshm-ak-2007 repository version
#   (string) NSHM_COUS_2008_VERSION - nshm-cous-2008 repository version
#   (string) NSHM_COUS_2014_VERSION - nshm-cous-2014 repository version
#   (string) NSHM_COUS_2018_VERSION - nshm-cous-2018 repository version
#   (string) NSHMP_HAZ_VERSION - nshmp-haz repository version
#   (string) WORKDIR - The Docker working directory
# Arguments:
#   None
# Returns:
#   None
####
download_repos() {
  cd ${HOME} 2> ${LOG_FILE};

  # Download nshmp-haz
  download_repo "usgs" "nshmp-haz" ${NSHMP_HAZ_VERSION};

  # Download nshm-ak-2007
  download_repo "usgs" "nshm-ak-2007" ${NSHM_AK_2007_VERSION};

  # Download nshm-cous-2008
  download_repo "usgs" "nshm-cous-2008" ${NSHM_COUS_2008_VERSION};

  # Download nshm-cous-2014
  download_repo "usgs" "nshm-cous-2014" ${NSHM_COUS_2014_VERSION};

  # Download nshm-cous-2018
  download_repo "usgs" "nshm-cous-2018" ${NSHM_COUS_2018_VERSION};
  
  # Change to WORKDIR
  cd ${WORKDIR} 2> ${LOG_FILE};
}

####
# Run main
####
main "$@";