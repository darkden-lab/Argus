pipeline {
    agent {
        kubernetes {
            defaultContainer 'golang'
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: golang
      image: golang:1.22-alpine
      command: ['sleep']
      args: ['infinity']
    - name: docker
      image: docker:24-dind
      securityContext:
        privileged: true
      volumeMounts:
        - name: docker-sock
          mountPath: /var/run/docker.sock
  volumes:
    - name: docker-sock
      emptyDir: {}
'''
        }
    }

    environment {
        REGISTRY      = 'ghcr.io'
        IMAGE_OWNER   = 'k8s-dashboard'
        BACKEND_IMAGE = "${REGISTRY}/${IMAGE_OWNER}/backend"
        IMAGE_TAG     = "${env.TAG_NAME ?: env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Lint') {
            steps {
                dir('backend') {
                    sh 'go vet ./...'
                }
            }
        }

        stage('Test') {
            steps {
                dir('backend') {
                    sh 'go test ./... -v -coverprofile=coverage.out'
                }
            }
        }

        stage('Docker Build') {
            steps {
                container('docker') {
                    sh "docker build -f deploy/docker/Dockerfile.backend -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend"
                }
            }
        }

        stage('Docker Push') {
            when {
                anyOf {
                    branch 'main'
                    buildingTag()
                }
            }
            steps {
                container('docker') {
                    withCredentials([usernamePassword(
                        credentialsId: 'ghcr-credentials',
                        usernameVariable: 'REGISTRY_USER',
                        passwordVariable: 'REGISTRY_PASS'
                    )]) {
                        sh "echo ${REGISTRY_PASS} | docker login ${REGISTRY} -u ${REGISTRY_USER} --password-stdin"
                        sh "docker push ${BACKEND_IMAGE}:${IMAGE_TAG}"
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'backend/coverage.out', allowEmptyArchive: true
            cleanWs()
        }
    }
}
