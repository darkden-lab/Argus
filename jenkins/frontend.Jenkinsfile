pipeline {
    agent {
        kubernetes {
            defaultContainer 'node'
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
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
  volumes:
    - name: docker-sock
      emptyDir: {}
'''
        }
    }

    environment {
        REGISTRY       = 'ghcr.io'
        IMAGE_OWNER    = 'k8s-dashboard'
        FRONTEND_IMAGE = "${REGISTRY}/${IMAGE_OWNER}/frontend"
        IMAGE_TAG      = "${env.TAG_NAME ?: env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            steps {
                dir('frontend') {
                    sh 'npm ci'
                }
            }
        }

        stage('Lint') {
            steps {
                dir('frontend') {
                    sh 'npm run lint'
                }
            }
        }

        stage('Build') {
            steps {
                dir('frontend') {
                    sh 'npm run build'
                }
            }
        }

        stage('Test') {
            steps {
                dir('frontend') {
                    sh 'npm test -- --passWithNoTests'
                }
            }
        }

        stage('Docker Build') {
            steps {
                container('docker') {
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
                        sh "docker push ${FRONTEND_IMAGE}:${IMAGE_TAG}"
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
