/**
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { assert } from 'chai';
import * as sinon from 'sinon';
import makeFakeApp from './make-fake-app';
import makeFakeSWReg from './make-fake-sw-reg';
import makeFakeSubscription from './make-fake-subscription';
import Errors from '../src/models/errors';
import WindowController from '../src/controllers/window-controller';
import SWController from '../src/controllers/sw-controller';
import ControllerInterface from '../src/controllers/controller-interface';
import DefaultSW from '../src/models/default-sw';
import FCMDetails from '../src/models/fcm-details';
import TokenDetailsModel from '../src/models/token-details-model';
import IIDModel from '../src/models/iid-model';
import NotificationPermission from '../src/models/notification-permission';

describe('Firebase Messaging > *Controller.getToken()', function() {
  const sandbox = sinon.sandbox.create();

  const EXAMPLE_FCM_TOKEN = 'ExampleFCMToken1337';
  const EXAMPLE_SENDER_ID = '1234567890';
  const EXAMPLE_INPUT = {
    swScope: '/example-scope',
    vapidKey:
      'BNJxw7sCGkGLOUP2cawBaBXRuWZ3lw_PmQMgreLVVvX_b' +
      '4emEWVURkCF8fUTHEFe2xrEgTt5ilh5xD94v0pFe_I',
    subscription: makeFakeSubscription(),
    fcmSenderId: '1234567890',
    fcmToken: 'qwerty',
    fcmPushSet: '7654321'
  };
  const app = makeFakeApp({
    messagingSenderId: EXAMPLE_INPUT.fcmSenderId
  });

  const servicesToTest = [WindowController, SWController];

  const mockGetReg = fakeReg => {
    servicesToTest.forEach(serviceClass => {
      sandbox
        .stub(serviceClass.prototype, 'getSWRegistration_')
        .callsFake(() => fakeReg);
    });
  };

  const cleanUp = () => {
    sandbox.restore();
  };

  beforeEach(function() {
    return cleanUp();
  });

  after(function() {
    return cleanUp();
  });

  it('should throw on unsupported browsers', function() {
    sandbox
      .stub(WindowController.prototype, 'isSupported_')
      .callsFake(() => false);

    const messagingService = new WindowController(app);
    return messagingService.getToken().then(
      () => {
        throw new Error('Expected getToken to throw ');
      },
      err => {
        assert.equal('messaging/' + Errors.codes.UNSUPPORTED_BROWSER, err.code);
      }
    );
  });

  it('should handle a failure to get registration', function() {
    sandbox
      .stub(ControllerInterface.prototype, 'getNotificationPermission_')
      .callsFake(() => NotificationPermission.granted);

    sandbox
      .stub(navigator.serviceWorker, 'register')
      .callsFake(() => Promise.reject('No Service Worker'));

    const messagingService = new WindowController(app);
    return messagingService
      .getToken()
      .then(
        () => {
          throw new Error('Expected getToken to throw ');
        },
        err => {
          assert.equal(
            'messaging/' + Errors.codes.FAILED_DEFAULT_REGISTRATION,
            err.code
          );
        }
      )
      .then(() => {
        messagingService.delete();
      });
  });

  it('should handle the notification permission', function() {
    const notificationStub = sandbox.stub(
      ControllerInterface.prototype,
      'getNotificationPermission_'
    );
    notificationStub.onCall(0).returns(NotificationPermission.denied);
    notificationStub.onCall(1).returns(NotificationPermission.default);
    notificationStub.onCall(2).returns(NotificationPermission.denied);
    notificationStub.onCall(3).returns(NotificationPermission.default);

    return servicesToTest.reduce((chain, ServiceClass) => {
      const serviceInstance = new ServiceClass(app);
      return chain
        .then(() => {
          return serviceInstance.getToken();
        })
        .then(
          () => {
            throw new Error('Expected getToken to throw ');
          },
          err => {
            assert.equal(
              'messaging/' + Errors.codes.NOTIFICATIONS_BLOCKED,
              err.code
            );
          }
        )
        .then(() => {
          return serviceInstance.getToken();
        })
        .then(token => {
          assert.equal(null, token);
        });
    }, Promise.resolve());
  });

  servicesToTest.forEach(ServiceClass => {
    it(`should get saved token in ${ServiceClass.name}`, function() {
      const registration = makeFakeSWReg();

      sandbox
        .stub(ControllerInterface.prototype, 'getNotificationPermission_')
        .callsFake(() => NotificationPermission.granted);

      mockGetReg(Promise.resolve(registration));

      sandbox
        .stub(TokenDetailsModel.prototype, 'getTokenDetailsFromSWScope')
        .callsFake(() => Promise.resolve(EXAMPLE_INPUT));

      const serviceInstance = new ServiceClass(app);
      return serviceInstance.getToken().then(token => {
        assert.equal(EXAMPLE_INPUT['fcmToken'], token);
      });
    });
  });

  servicesToTest.forEach(ServiceClass => {
    it('should get a new token', function() {
      const registration = makeFakeSWReg();
      const subscription = makeFakeSubscription();
      const TOKEN_DETAILS = {
        token: 'example-token',
        pushSet: 'example-pushSet'
      };

      sandbox
        .stub(ControllerInterface.prototype, 'getNotificationPermission_')
        .callsFake(() => NotificationPermission.granted);

      sandbox
        .stub(ControllerInterface.prototype, 'getPushSubscription_')
        .callsFake(() => Promise.resolve(subscription));

      sandbox
        .stub(IIDModel.prototype, 'getToken')
        .callsFake(() => Promise.resolve(TOKEN_DETAILS));

      mockGetReg(Promise.resolve(registration));

      sandbox
        .stub(TokenDetailsModel.prototype, 'getTokenDetailsFromSWScope')
        .callsFake(() => Promise.resolve(null));

      sandbox
        .stub(TokenDetailsModel.prototype, 'saveTokenDetails')
        .callsFake(() => Promise.resolve());

      const serviceInstance = new ServiceClass(app);
      return serviceInstance.getToken().then(token => {
        assert.equal('example-token', token);

        // Ensure save token is called.
        assert.equal(
          TokenDetailsModel.prototype.saveTokenDetails['callCount'],
          1
        );
        const saveArgs = TokenDetailsModel.prototype.saveTokenDetails[
          'getCall'
        ](0)['args'][0];
        assert.equal(saveArgs.swScope, registration.scope);
        assert.equal(saveArgs.vapidKey, FCMDetails.DEFAULT_PUBLIC_VAPID_KEY);
        assert.equal(saveArgs.subscription, subscription);
        assert.equal(saveArgs.fcmSenderId, EXAMPLE_SENDER_ID);
        assert.equal(saveArgs.fcmToken, TOKEN_DETAILS['token']);
        assert.equal(saveArgs.fcmPushSet, TOKEN_DETAILS['pushSet']);
      });
    });
  });
});
