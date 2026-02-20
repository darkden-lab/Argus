pipeline {
    agent {
        kubernetes {
            defaultContainer 'jnlp'
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: golang
      image: golang:1.22-alpine
      command: ['sleep']
      args: ['infinity']
    - name: node
      image: node:20-alpine
      command: ['sleep']
      args: ['infinity']
    - name: docker
      image: docker:24-dind
      securityContext:
        privileged: true
      volumeMounts:
        - name: docker-sock
          mountPath: /var/run/docker.sock
    - name: helm
      image: alpine/helm:3.14
      command: ['sleep']
      args: ['infinity']
  volumes:
    - name: docker-sock
      emptyDir: {}
'''
        }
    }

    environment {
        REGISTRY       = 'ghcr.io'
        IMAGE_OWNER   = 'darkden-lab'
        BACKEND_IMAGE  = "${REGISTRY}/${IMAGE_OWNER}/argus-backend"
        FRONTEND_IMAGE = "${REGISTRY}/${IMAGE_OWNER}/argus-frontend"
        IMAGE_TAG      = "${env.TAG_NAME ?: env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Backend Lint & Test') {
            steps {
                container('golang') {
                    dir('backend') {
                        sh 'go vet ./...'
                        sh 'go test ./... -v -coverprofile=coverage.out'
                    }
                }
            }
        }

        stage('Frontend Lint & Test') {
            steps {
                container('node') {
                    dir('frontend') {
                        sh 'npm ci'
                        sh 'npm run lint'
                        sh 'npm run build'
                        sh 'npm test -- --passWithNoTests'
                    }
                }
            }
        }

        stage('Docker Build') {
            steps {
                container('docker') {
                    sh "docker build -f deploy/docker/Dockerfile.backend -t ${BACKEND_IMAGE}:${IMAGE_TAG} ./backend"
                    sh "docker build -f deploy/docker/Dockerfile.frontend -t ${FRONTEND_IMAGE}:${IMAGE_TAG} ./frontend"
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
                        sh "docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                        sh "docker tag ${BACKEND_IMAGE}:${IMAGE_TAG} ${BACKEND_IMAGE}:latest"
                        sh "docker tag ${FRONTEND_IMAGE}:${IMAGE_TAG} ${FRONTEND_IMAGE}:latest"
                        sh "docker push ${BACKEND_IMAGE}:latest"
                        sh "docker push ${FRONTEND_IMAGE}:latest"
                    }
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                container('helm') {
                    sh """
                        helm upgrade --install argus deploy/helm/argus \
                            --set backend.image.repository=${BACKEND_IMAGE} \
                            --set backend.image.tag=${IMAGE_TAG} \
                            --set frontend.image.repository=${FRONTEND_IMAGE} \
                            --set frontend.image.tag=${IMAGE_TAG} \
                            --wait --timeout 5m
                    """
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
