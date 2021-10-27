import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';
import * as cloud9 from '@aws-cdk/aws-cloud9';
import * as opensearch from '@aws-cdk/aws-opensearchservice';

export class CdkCsenvStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Parametros requeridos para hacer el deployment
    
    const cloud9OwnerUserArn = new cdk.CfnParameter(this, "cloud9OwnerUserArn", {
      type: "String",
      description: "Cloud9 Owner - IAM ARN."});
      
    const cloud9OwnerUserArn2 = new cdk.CfnParameter(this, "cloud9OwnerUserArn2", {
      type: "String",
      description: "Cloud9 2 Owner - IAM ARN."});

    // Creacion de la VPC con el rango de red requrido

    const vpc = new ec2.Vpc(this, "my-vpc", {
      cidr: "10.1.0.0/16",
      subnetConfiguration: [
        {  cidrMask: 22, subnetType: ec2.SubnetType.PUBLIC, name: "Public" },
        {  cidrMask: 22, subnetType: ec2.SubnetType.PRIVATE, name: "Private" }
        ],
      maxAzs: 3
    });
    
    // Creación de permisos y role para usuario administrador
    
    const administratorManagedPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      'AdministratorAccess',
    );
    
    const role = new iam.Role(this, 'eks_role', { 
      managedPolicies: [administratorManagedPolicy ], 
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    // Grupo de seguridad para instancia de EC2

    const mySecurityGroup = new ec2.SecurityGroup(this, 'bastion_security_group', {
      vpc,
      description: 'Allow ssh access to ec2 instances',
      allowAllOutbound: true   // Can be set to false
    });
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow ssh access from the world');
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allIcmp(), 'allow icmp');

    // Amazon Linux Image - CPU Tipo ARM64 o X86_64
    
    const ami = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      cpuType: ec2.AmazonLinuxCpuType.X86_64
    });

    // Crea la instancia de EC2 usando el Security Group, AMI, and KeyPair definidios en la VPC creada
    
    const ec2Instance = new ec2.Instance(this, 'bastion', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      machineImage: ami,
      securityGroup: mySecurityGroup,
      role: role
    });
    
    // Creamos una instancia de Cloud9 en el ambiente público
    
    const cloud9EKSEnv = new cloud9.CfnEnvironmentEC2(this, 'cloud9EKSEnv', {
      instanceType: 't3.large', 
      subnetId: vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}).subnets[0].subnetId,
      ownerArn: cloud9OwnerUserArn.valueAsString
    });
    
    // Creamos grupo de seguridad para instancia de OpenSearch
    
    const mySecurityGroupDomain = new ec2.SecurityGroup(this, 'domain_security_group', {
      vpc,
      description: 'Allow access to opensearch domain',
      allowAllOutbound: true   // Can be set to false
    });
    
    mySecurityGroupDomain.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTcp(), 'allow tcp');
    
    // Creamos instancia de OpenSearh
    
    const opensearchDomain = new opensearch.Domain(this, 'Domain', {
      version: opensearch.EngineVersion.OPENSEARCH_1_0,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      vpc,
      // must be enabled since our VPC contains multiple private subnets.
      zoneAwareness: {
        enabled: true,
      },
      securityGroups: [mySecurityGroupDomain],
      capacity: {
        // must be an even number since the default az count is 2.
        dataNodes: 2,
        dataNodeInstanceType: 'm6g.large.search',
        masterNodeInstanceType: 'm6g.large.search'
      },
    });    
    
    
  }
}