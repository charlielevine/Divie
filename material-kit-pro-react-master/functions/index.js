const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const firebase = require('firebase');
const config = require('./config');
// gets us past CORS errors
const cors = require('cors')({ origin: true });

// The Firebase Admin SDK to access Cloud Firestore.
const admin = require('firebase-admin');
// private key generated by firebase console...probably should not be on public github
const serviceAccount = require('./divieapp-firebase-adminsdk-574mb-3ee6b35d6c.json');

// initialize firebase!
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://divieapp.firebaseio.com'
});
firebase.initializeApp(config);

//initialize express server
const app = express();
const main = express();

//add the path to receive request and set json as bodyParser to process the body
main.use('/api/v1', app);
main.use(bodyParser.json());
main.use(bodyParser.urlencoded({ extended: false }));

//initialize the database and the auth
const db = admin.firestore();
const auth = firebase.auth();

// Create new user
exports.signUp = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    const newUser = {
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      password: req.body.password
    };
    let userId;
    const defaultImg = 'defaultImg.png';

    if (newUser.password.trim().length < 6) {
      return res
        .status(400)
        .json({ message: 'Password must be at least 6 characters.' });
    }

    db.doc(`/users/${newUser.email}`)
      .get()
      .then(doc => {
        if (doc.exists) {
          return res
            .status(400)
            .json({ message: 'Email has been already taken' });
        } else {
          return auth
            .createUserWithEmailAndPassword(newUser.email, newUser.password)
            .then(data => {
              data.user.sendEmailVerification();
              userId = data.user.uid;

              const userCredentials = {
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                userId: userId,
                imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${defaultImg}?alt=media`
              };
              return db
                .doc(`/users/${newUser.email}`)
                .set(userCredentials)
                .then(data => {
                  return res
                    .status(201)
                    .json({ message: 'sign up successful' });
                })
                .catch(err => {
                  console.log(err);
                });
            })
            .catch(err => {
              console.log(err);
              if (err.code == 'auth/email-already-in-use') {
                return res
                  .status(400)
                  .json({ message: 'Email Already in Use' });
              } else {
                return res.status(500).json({ message: err.code });
              }
            });
        }
      })
      .catch(err => {
        console.log(err);
        return res.status(500).json({ message: err.code });
      });
  });
});


// User login
exports.login = functions.https.onRequest( (req, res) => {

  cors(req, res, () => {
    const existingUser = {
      email: req.body.email,
      password: req.body.password
    };
 
    auth.signInWithEmailAndPassword(existingUser.email, existingUser.password)
    .then( data => {

      if (data.user.emailVerified) {
        const token = data.user.getIdToken();
        return token;
      } else {
          throw Error
       }
    }).then(token => {
        return res.json({token, message: 'Login success'});
      })
      .catch(err => {

        if (
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/user-not-found'
        ) {
          return res.status(403).json({ message: 'Email or password incorrect' });
        } else {
          console.log(err)
          return res.status(403).json({ message: 'Please verify your email address' })
        }
      });
  });
});

// Returns current user data
exports.getUserData = functions.https.onRequest( (req, res) => {

  cors(req, res, () => {
    const currentUser = {
      token: req.headers.authorization.split('Bearer ')[1]
    };

    admin.auth().verifyIdToken(currentUser.token).then(decodedToken =>{
      //console.log(decodedToken)
      const user = decodedToken
      db.doc(`users/${user.email}`)
      .get()
      .then( snapshot => {
        const data = snapshot.data()
        return data;
      })
      .then( data => {
        return res.json({data})
      })
      .catch( err => {
        console.log(err)
        return res.status(500).send( {error: "error in getting data"} )
      })
    })

  })
})

// logout
exports.logout = functions.https.onRequest( (req, res) => {
  cors(req, res, () => {
    auth.signOut().then( () => {
      return res.send( {message: 'Logout success'})
    })
    .catch( err =>{
      // log errors don't send them back to client
      // may contain sensitive data
      console.log(err)
      return res.status(500).json({message: 'Error in logout'})
    })
  })
})

exports.resendEmailVerification = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    auth
      .sendSignInLinkToEmail(req.body.email)
      .then(res => {
        return res.status(200).send(res);
      })
      .catch(error => {
        return res.status(500).send(error);
      });
  });
});
